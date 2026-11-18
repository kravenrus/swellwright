import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  type PluginList,
  type PluginPermissionChange,
  type PluginPermissionsView,
  type PluginStatus,
  type PluginView,
} from '@swellwright/contracts';
import { type Database, type PluginApproval } from '@swellwright/db';
import { permissionDiff, type PluginPermissions, widensPermissions } from '@swellwright/plugin-api';

import { AuditService } from '../audit/audit.service.js';
import { type RequestMeta, requireDatabase } from '../auth/context.js';
import { type AppConfig } from '../config.js';
import { CONFIG, DATABASE } from '../tokens.js';
import { type Actor } from '../users/users.service.js';
import { type DiscoveredPlugin, discoverPlugins } from './discovery.js';
import type { RuntimeSnapshot } from './host/process.js';
import { PluginRuntime } from './runtime.js';

/** An arbitrary constant: one transaction at a time may enable, disable or switch off a plugin. */
const PLUGINS_LOCK_KEY = 7_761_238;

/** Why a plugin that was enabled was switched off without anyone asking. */
export type SwitchOffReason = 'missing' | 'unavailable' | 'changed';

/** The permissions in one canonical form, so the text that is stored and compared is always the same. */
export function canonicalPermissions(permissions: PluginPermissions): PluginPermissionsView {
  return {
    network: [...permissions.network].sort(),
    secrets: [...permissions.secrets].sort(),
    panel: [...permissions.panel].sort(),
    ssh: permissions.ssh,
  };
}

function parseApproved(text: string): PluginPermissionsView {
  const value = JSON.parse(text) as PluginPermissionsView;
  return canonicalPermissions(value);
}

/** The usable plugin for an id, or failing that any plugin whose manifest names it (to tell why it is not usable). */
function indexById(found: readonly DiscoveredPlugin[]): Map<string, DiscoveredPlugin> {
  const index = new Map<string, DiscoveredPlugin>();
  for (const plugin of found) {
    const id = plugin.manifest?.id;
    if (id === undefined) {
      continue;
    }
    const known = index.get(id);
    if (known === undefined || (known.state === 'invalid' && plugin.state !== 'invalid')) {
      index.set(id, plugin);
    }
  }
  return index;
}

function whyNotRunning(
  record: PluginApproval,
  plugin: DiscoveredPlugin | undefined,
): SwitchOffReason | undefined {
  if (plugin === undefined) {
    return 'missing';
  }
  if (plugin.state !== 'available') {
    return 'unavailable';
  }
  return plugin.digest === record.digest ? undefined : 'changed';
}

function statusOf(
  plugin: DiscoveredPlugin | undefined,
  record: PluginApproval | undefined,
): PluginStatus {
  if (plugin === undefined) {
    return 'missing';
  }
  if (plugin.state !== 'available') {
    return 'unavailable';
  }
  if (record === undefined) {
    return 'not_enabled';
  }
  if (record.digest !== plugin.digest) {
    return 'changed';
  }
  return record.enabled ? 'enabled' : 'disabled';
}

function changeOf(
  approved: PluginPermissionsView,
  now: PluginPermissionsView,
): PluginPermissionChange {
  const diff = permissionDiff(approved, now);
  const list = (change: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
  }) => ({
    added: [...change.added],
    removed: [...change.removed],
  });
  return {
    network: list(diff.network),
    secrets: list(diff.secrets),
    panel: list(diff.panel),
    ssh: diff.ssh,
    widens: widensPermissions(diff),
  };
}

function runtimeOf(snapshot: RuntimeSnapshot): PluginView['runtime'] {
  return {
    state: snapshot.state,
    startedAt: snapshot.startedAt?.toISOString() ?? null,
    calls: snapshot.calls,
    lastError: snapshot.lastError,
    modules: snapshot.modules.map((m) => ({ kind: m.kind, methods: [...m.methods] })),
  };
}

export function viewOf(
  plugin: DiscoveredPlugin | undefined,
  record: PluginApproval | undefined,
  runtime: RuntimeSnapshot,
): PluginView {
  const manifest = plugin?.manifest;
  const status = statusOf(plugin, record);
  const permissions = manifest ? canonicalPermissions(manifest.permissions) : null;
  const approved = record ? parseApproved(record.permissions) : null;
  return {
    id: manifest?.id ?? plugin?.folder ?? record?.pluginId ?? '',
    folder: plugin?.folder ?? null,
    trust: plugin?.trust ?? null,
    discovery: plugin?.state ?? null,
    status,
    problems: [...(plugin?.problems ?? [])],
    name: manifest?.name ?? null,
    version: manifest?.version ?? null,
    description: manifest?.description ?? null,
    license: manifest?.license ?? null,
    provides: (manifest?.provides ?? []).map((p) => ({
      kind: p.kind,
      mode: p.driver === undefined ? 'code' : 'declarative',
    })),
    permissions,
    digest: plugin?.digest ?? null,
    signed: manifest?.signature !== undefined,
    hasSettings: manifest?.ui !== undefined,
    approval: record
      ? {
          version: record.version,
          trust: record.trust === 'official' ? 'official' : 'local',
          digest: record.digest,
          permissions:
            approved ?? canonicalPermissions({ network: [], secrets: [], panel: [], ssh: false }),
          approvedAt: record.approvedAt.toISOString(),
          approvedBy: record.approvedBy,
        }
      : null,
    runtime: runtimeOf(status === 'enabled' ? runtime : { ...runtime, state: 'stopped' }),
    change:
      status === 'changed' && permissions !== null && approved !== null
        ? changeOf(approved, permissions)
        : null,
  };
}

/**
 * Which plugins this instance has and which of them an administrator approved (ADR 0027). Discovery describes
 * the files (ADR 0021); this adds the decision, tied to the digest of the files, so a plugin whose files change
 * after approval is switched off and must be approved again. Nothing here runs a plugin.
 */
@Injectable()
export class PluginsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Plugins');

  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: Pick<AppConfig, 'pluginRoots' | 'version'>,
    @Inject(PluginRuntime) private readonly runtime: PluginRuntime,
  ) {}

  private get db(): Database['client'] {
    return requireDatabase(this.database).client;
  }

  /** A plugin that changed while Swellwright was off must not come back switched on. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.database) {
      return;
    }
    try {
      await this.reconcile(await this.discover());
    } catch (error) {
      this.logger.warn(
        `could not check the enabled plugins at start: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private discover(): Promise<DiscoveredPlugin[]> {
    return discoverPlugins(this.config.pluginRoots, this.config.version);
  }

  /** Switches off every enabled plugin that is gone, unusable, or no longer what was approved. */
  private async reconcile(found: readonly DiscoveredPlugin[]): Promise<void> {
    const byId = indexById(found);
    const enabled = await this.db.pluginApproval.findMany({ where: { enabled: true } });
    for (const record of enabled) {
      const reason = whyNotRunning(record, byId.get(record.pluginId));
      if (reason !== undefined) {
        await this.switchOff(record.pluginId, reason);
      }
    }
  }

  private async switchOff(pluginId: string, reason: SwitchOffReason): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLUGINS_LOCK_KEY})`;
      const changed = await tx.pluginApproval.updateMany({
        where: { pluginId, enabled: true },
        data: { enabled: false },
      });
      if (changed.count === 0) {
        return;
      }
      const record = await tx.pluginApproval.findUnique({ where: { pluginId } });
      await this.audit.record(
        {
          action: 'plugin.disabled',
          outcome: 'success',
          actor: null,
          object: { type: 'plugin', id: pluginId },
          details: { reason, version: record?.version ?? null },
          meta: { ip: undefined, requestId: undefined },
        },
        tx,
      );
    });
    this.runtime.requestStop(pluginId);
  }

  /**
   * The plugin as it may run now: enabled, approved, and with files that are what was approved. A plugin that
   * was enabled and is not any more is switched off here, so the host never runs what nobody approved.
   */
  async runnable(id: string): Promise<
    | { readonly kind: 'ok'; readonly plugin: DiscoveredPlugin; readonly network: readonly string[] }
    | { readonly kind: 'unknown' }
    | { readonly kind: 'not_enabled'; readonly why: string }
  > {
    const plugin = indexById(await this.discover()).get(id);
    const record = await this.db.pluginApproval.findUnique({ where: { pluginId: id } });
    if (record === null) {
      return plugin === undefined ? { kind: 'unknown' } : { kind: 'not_enabled', why: 'it was never enabled' };
    }
    if (!record.enabled) {
      return { kind: 'not_enabled', why: 'it is disabled' };
    }
    const reason = whyNotRunning(record, plugin);
    if (reason !== undefined || plugin === undefined) {
      await this.switchOff(id, reason ?? 'missing');
      return { kind: 'not_enabled', why: `its files are not what was approved (${reason ?? 'missing'}); it was switched off` };
    }
    return { kind: 'ok', plugin, network: parseApproved(record.permissions).network };
  }

  async list(): Promise<PluginList> {
    const found = await this.discover();
    await this.reconcile(found);
    const records = new Map(
      (await this.db.pluginApproval.findMany()).map((record) => [record.pluginId, record]),
    );
    const byId = indexById(found);
    const plugins = found.map((plugin) =>
      viewOf(
        plugin,
        plugin.manifest ? records.get(plugin.manifest.id) : undefined,
        this.runtime.snapshotOf(plugin.manifest?.id ?? ''),
      ),
    );
    const shown = new Set(found.flatMap((p) => (p.manifest ? [p.manifest.id] : [])));
    for (const record of records.values()) {
      if (!shown.has(record.pluginId) && !byId.has(record.pluginId)) {
        plugins.push(viewOf(undefined, record, this.runtime.snapshotOf(record.pluginId)));
      }
    }
    const roots = this.config.pluginRoots;
    return {
      plugins,
      directories: {
        official: roots.some((r) => r.trust === 'official'),
        local: roots.some((r) => r.trust === 'local'),
      },
    };
  }

  async viewById(id: string): Promise<PluginView> {
    const { plugins } = await this.list();
    const view =
      plugins.find((p) => p.id === id && p.discovery !== 'invalid') ??
      plugins.find((p) => p.id === id);
    if (!view) {
      throw new NotFoundException('There is no such plugin.');
    }
    return view;
  }

  /**
   * Approves a plugin as it is now. The digest is what the administrator was shown; if the files differ the
   * approval is refused, so nobody approves code they have not seen.
   */
  async enable(actor: Actor, id: string, digest: string, meta: RequestMeta): Promise<PluginView> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLUGINS_LOCK_KEY})`;
      const plugin = indexById(await this.discover()).get(id);
      if (plugin?.manifest === undefined) {
        throw new NotFoundException('There is no such plugin.');
      }
      if (plugin.state !== 'available' || plugin.digest === undefined) {
        throw new ConflictException(
          `This plugin cannot be enabled: ${plugin.problems[0] ?? 'it is not usable'}.`,
        );
      }
      if (plugin.digest !== digest) {
        throw new ConflictException(
          'The plugin changed since you looked at it. Review it again before enabling.',
        );
      }
      const permissions = canonicalPermissions(plugin.manifest.permissions);
      const data = {
        enabled: true,
        version: plugin.manifest.version,
        trust: plugin.trust,
        digest: plugin.digest,
        permissions: JSON.stringify(permissions),
        approvedAt: new Date(),
        approvedBy: actor?.name ?? 'unknown',
      };
      await tx.pluginApproval.upsert({
        where: { pluginId: id },
        create: { pluginId: id, ...data },
        update: data,
      });
      await this.audit.record(
        {
          action: 'plugin.enabled',
          outcome: 'success',
          actor,
          object: { type: 'plugin', id },
          details: {
            version: plugin.manifest.version,
            trust: plugin.trust,
            digest: plugin.digest,
            network: permissions.network.length,
            secrets: permissions.secrets.length,
            panel: permissions.panel.length,
            ssh: permissions.ssh,
          },
          meta,
        },
        tx,
      );
    });
    return this.viewById(id);
  }

  /** Switches a plugin off. The approval stays on record; one that is not enabled is left as it is. */
  async disable(actor: Actor, id: string, meta: RequestMeta): Promise<PluginView> {
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLUGINS_LOCK_KEY})`;
      const record = await tx.pluginApproval.findUnique({ where: { pluginId: id } });
      if (record === null) {
        if (indexById(await this.discover()).has(id)) {
          return;
        }
        throw new NotFoundException('There is no such plugin.');
      }
      if (!record.enabled) {
        return;
      }
      await tx.pluginApproval.update({ where: { pluginId: id }, data: { enabled: false } });
      await this.audit.record(
        {
          action: 'plugin.disabled',
          outcome: 'success',
          actor,
          object: { type: 'plugin', id },
          details: { reason: 'administrator', version: record.version },
          meta,
        },
        tx,
      );
    });
    this.runtime.requestStop(id);
    return this.viewById(id);
  }
}
