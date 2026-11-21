import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  StreamableFile,
} from '@nestjs/common';
import type {
  ArtifactList,
  ArtifactManifest,
  ArtifactVersionView,
  ArtifactView,
} from '@swellwright/contracts';
import { type Database } from '@swellwright/db';

import { AuditService } from '../audit/audit.service.js';
import { type AppConfig } from '../config.js';
import { CodedHttpException } from '../http.js';
import { CONFIG, DATABASE } from '../tokens.js';
import {
  byVersionDescending,
  type CatalogueEntry,
  fileProblem,
  loadCatalogue,
  sha256Of,
} from './catalogue.js';

/** An artifact version that was checked just now and may be used: its manifest, and the bytes that were hashed. */
export interface VerifiedArtifact {
  readonly manifest: ArtifactManifest;
  readonly bytes: Buffer;
}

const NO_REQUEST = { ip: undefined, requestId: undefined } as const;

/**
 * The catalogue of built-in artifacts (ADR 0039): found and verified when the server starts, verified again whenever a
 * file is used. A file that is not what its manifest says is `broken`: it is listed, with the reason, and neither
 * downloaded nor pushed. Nothing here can stop the server from starting.
 */
@Injectable()
export class CatalogueService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Artifacts');
  private entries: readonly CatalogueEntry[] = [];

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.reload();
  }

  /** Reads and verifies everything again. Broken artifacts are logged and noted in the audit chain. */
  async reload(): Promise<void> {
    try {
      this.entries = await loadCatalogue(
        this.config.artifacts.directory,
        this.config.artifacts.maxBytes,
      );
    } catch (error) {
      // A catalogue that cannot be read at all is an empty one: the rest of the server must still work.
      this.entries = [];
      this.logger.error(
        `could not read the artifact catalogue at ${this.config.artifacts.directory}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return;
    }
    const broken = this.entries.filter((entry) => entry.state === 'broken');
    this.logger.log(
      `${String(this.entries.length - broken.length)} artifact(s) verified${broken.length > 0 ? `, ${String(broken.length)} broken` : ''}`,
    );
    for (const entry of broken) {
      this.logger.error(`artifact "${entry.directory}" is broken: ${entry.problem ?? 'unknown'}`);
      await this.noteBroken(entry, entry.problem ?? 'unknown');
    }
  }

  private async noteBroken(entry: CatalogueEntry, problem: string): Promise<void> {
    if (this.database === undefined) {
      return;
    }
    await this.audit.note({
      action: 'artifact.broken',
      outcome: 'failure',
      object: { type: 'artifact', id: entry.manifest?.name ?? entry.directory },
      details: {
        artifact: entry.manifest?.name ?? entry.directory,
        version: entry.manifest?.version ?? null,
        sha256_prefix: entry.manifest?.sha256.slice(0, 12) ?? null,
        problem: problem.slice(0, 200),
      },
      meta: NO_REQUEST,
    });
  }

  private viewOf(entry: CatalogueEntry): ArtifactVersionView {
    return {
      version: entry.manifest?.version ?? null,
      state: entry.state,
      problem: entry.problem ?? null,
      sha256: entry.manifest?.sha256 ?? null,
      size: entry.manifest?.size ?? null,
      manifest: entry.manifest ?? null,
    };
  }

  private groups(): ArtifactView[] {
    const byName = new Map<string, CatalogueEntry[]>();
    const loose: CatalogueEntry[] = [];
    for (const entry of this.entries) {
      if (entry.manifest) {
        byName.set(entry.manifest.name, [...(byName.get(entry.manifest.name) ?? []), entry]);
      } else {
        loose.push(entry);
      }
    }
    const grouped = [...byName.entries()].map(([name, entries]): ArtifactView => {
      const sorted = [...entries].sort((a, b) =>
        byVersionDescending(a.manifest?.version ?? '0.0.0', b.manifest?.version ?? '0.0.0'),
      );
      const latest = sorted.find((entry) => entry.state === 'ok');
      return {
        name,
        description: latest?.manifest?.description ?? sorted[0]?.manifest?.description ?? null,
        latestVersion: latest?.manifest?.version ?? null,
        versions: sorted.map((entry) => this.viewOf(entry)),
      };
    });
    const orphans = loose.map((entry): ArtifactView => ({
      name: entry.directory,
      description: null,
      latestVersion: null,
      versions: [this.viewOf(entry)],
    }));
    return [...grouped, ...orphans].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  list(): ArtifactList {
    return { artifacts: this.groups() };
  }

  get(name: string): ArtifactView {
    const found = this.groups().find(
      (artifact) => artifact.name === name && artifact.versions.some((v) => v.manifest !== null),
    );
    if (!found) {
      throw new NotFoundException('There is no such artifact.');
    }
    return found;
  }

  getVersion(name: string, version: string): ArtifactVersionView {
    const found = this.get(name).versions.find((candidate) => candidate.version === version);
    if (!found) {
      throw new NotFoundException('There is no such version of this artifact.');
    }
    return found;
  }

  /** Whether the catalogue holds this version, and intact; used to describe a copy on a server. */
  stateOf(name: string, version: string): 'ok' | 'broken' | 'missing' {
    const entry = this.find(name, version);
    return entry === undefined ? 'missing' : entry.state;
  }

  /** The declared hash of a version the catalogue holds intact, for comparing a copy with it. */
  declaredSha256(name: string, version: string): string | undefined {
    const entry = this.find(name, version);
    return entry?.state === 'ok' ? entry.manifest?.sha256 : undefined;
  }

  private find(name: string, version: string): CatalogueEntry | undefined {
    return this.entries.find(
      (entry) => entry.manifest?.name === name && entry.manifest.version === version,
    );
  }

  /** The version to use: the one asked for, or the latest that is ok. 404 when there is none, 409 when it is broken. */
  private choose(name: string, version: string | undefined): CatalogueEntry {
    const candidates = this.entries.filter((entry) => entry.manifest?.name === name);
    if (candidates.length === 0) {
      throw new NotFoundException('There is no such artifact.');
    }
    if (version !== undefined) {
      const entry = candidates.find((candidate) => candidate.manifest?.version === version);
      if (!entry) {
        throw new NotFoundException('There is no such version of this artifact.');
      }
      return entry;
    }
    const newestFirst = [...candidates].sort((a, b) =>
      byVersionDescending(a.manifest?.version ?? '0.0.0', b.manifest?.version ?? '0.0.0'),
    );
    const intact = newestFirst.find((entry) => entry.state === 'ok');
    if (intact) {
      return intact;
    }
    // None is intact. The newest one that a look at its file could mend is looked at again by the caller (it may have
    // been put right on disk); it answers "broken" itself if it still is not.
    const retry = newestFirst.find((entry) => entry.structural !== true);
    if (!retry) {
      throw this.brokenError(name, newestFirst[0]?.problem ?? 'No version of it is intact.');
    }
    return retry;
  }

  private brokenError(name: string, problem: string): CodedHttpException {
    return new CodedHttpException(
      409,
      'artifact_broken',
      `The artifact "${name}" is broken and is not served: ${problem}`,
    );
  }

  /**
   * Checks the file again, now, because the file may have been changed since the server started, and marks the
   * artifact broken (and records it) when it is not what the manifest says. Returns the entry only if it is intact.
   */
  private async recheck(
    entry: CatalogueEntry,
    actor?: { id: string; name: string },
  ): Promise<CatalogueEntry> {
    const manifest = entry.manifest;
    if (!manifest) {
      throw this.brokenError(entry.directory, entry.problem ?? 'The manifest is malformed.');
    }
    if (entry.structural === true) {
      throw this.brokenError(manifest.name, entry.problem ?? 'The artifact is declared twice.');
    }
    let problem: string | undefined;
    try {
      problem = await fileProblem(entry.path, manifest, this.config.artifacts.maxBytes);
    } catch (error) {
      problem = `The file could not be checked (${error instanceof Error ? error.message : 'unknown error'}).`;
    }
    const was = entry.state;
    const now: CatalogueEntry = {
      ...entry,
      state: problem === undefined ? 'ok' : 'broken',
      problem,
    };
    this.entries = this.entries.map((candidate) => (candidate === entry ? now : candidate));
    if (problem !== undefined) {
      if (was === 'ok') {
        this.logger.error(`artifact "${manifest.name}" ${manifest.version} is broken: ${problem}`);
        if (this.database !== undefined) {
          await this.audit.note({
            action: 'artifact.broken',
            outcome: 'failure',
            ...(actor ? { actor } : {}),
            object: { type: 'artifact', id: manifest.name },
            details: {
              artifact: manifest.name,
              version: manifest.version,
              sha256_prefix: manifest.sha256.slice(0, 12),
              problem: problem.slice(0, 200),
            },
            meta: NO_REQUEST,
          });
        }
      }
      throw this.brokenError(manifest.name, problem);
    }
    return now;
  }

  /**
   * The file of a version, read whole and hashed now: what a push uploads. Memory is bounded by
   * `SW_ARTIFACT_MAX_BYTES`. The bytes returned are the bytes that were hashed, so nothing can change in between.
   */
  async readVerified(
    name: string,
    version: string | undefined,
    actor?: { id: string; name: string },
  ): Promise<VerifiedArtifact> {
    // A broken artifact is looked at again before it is refused: it may have been mended on disk.
    const entry = await this.recheck(this.choose(name, version), actor);
    const manifest = entry.manifest;
    if (!manifest) {
      throw this.brokenError(name, 'The manifest is malformed.');
    }
    const bytes = await readFile(join(entry.path, manifest.file));
    if (bytes.length !== manifest.size || sha256Of(bytes) !== manifest.sha256) {
      // Changed between the check and the read: the same answer as a failed check.
      throw this.brokenError(manifest.name, 'The file changed while it was being read.');
    }
    return { manifest, bytes };
  }

  /** A download: checked now, then streamed from the disk. The caller sets the headers from the manifest. */
  async open(
    name: string,
    version: string | undefined,
    actor?: { id: string; name: string },
  ): Promise<{ readonly manifest: ArtifactManifest; readonly file: StreamableFile }> {
    const entry = await this.recheck(this.choose(name, version), actor);
    const manifest = entry.manifest;
    if (!manifest) {
      throw this.brokenError(name, 'The manifest is malformed.');
    }
    return {
      manifest,
      file: new StreamableFile(createReadStream(join(entry.path, manifest.file)), {
        type: 'application/octet-stream',
        disposition: `attachment; filename="${manifest.file}"`,
        length: manifest.size,
      }),
    };
  }
}
