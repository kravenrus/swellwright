import { fileURLToPath } from 'node:url';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { PluginView } from '@swellwright/contracts';

import { AuditService } from '../../audit/audit.service.js';
import { type RequestMeta } from '../../auth/context.js';
import { type AppConfig } from '../../config.js';
import { CONFIG, PLUGIN_NETWORK } from '../../tokens.js';
import { type Actor } from '../../users/users.service.js';
import { type DiscoveredPlugin } from '../discovery.js';
import { PluginsService } from '../plugins.service.js';
import { PluginRuntime } from '../runtime.js';
import { PluginNetwork } from './network.js';
import { PluginCallError, PluginProcess } from './process.js';

const RUNNER = fileURLToPath(new URL('./runner.js', import.meta.url));
const START_TIMEOUT_MS = 10_000;
/** A plugin that fails this many times within the window is left alone for the window. */
const FAILURES_ALLOWED = 3;
const FAILURE_WINDOW_MS = 60_000;
/** The audit chain takes at most this many notes about one plugin in a window, whatever it does. */
const NOTES_PER_WINDOW = 5;
const NOTE_WINDOW_MS = 10 * 60_000;

interface Runnable {
  readonly plugin: DiscoveredPlugin;
  readonly network: readonly string[];
}

/**
 * Runs approved plugins, each in a process of its own under the Node permission model (ADR 0028), and is the
 * one place the core talks to them. A plugin runs only while it is enabled and its files are what was
 * approved: that is checked before every start and every call, and a plugin that is switched off is stopped
 * at once, without restarting anything else.
 */
@Injectable()
export class PluginHostService implements OnApplicationShutdown {
  private readonly logger = new Logger('PluginHost');
  private readonly processes = new Map<string, PluginProcess>();
  private readonly starting = new Map<string, Promise<PluginProcess>>();
  private readonly failures = new Map<string, number[]>();
  private readonly notes = new Map<string, number[]>();
  private readonly idle = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(PluginsService) private readonly plugins: PluginsService,
    @Inject(PluginRuntime) private readonly runtime: PluginRuntime,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: Pick<AppConfig, 'pluginLimits'>,
    @Inject(PLUGIN_NETWORK) private readonly gateway: PluginNetwork,
  ) {
    runtime.onStop((id) => {
      void this.stop(id);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.processes.keys()].map((id) => this.stop(id)));
  }

  /** Whether the audit chain may take another note about this plugin now. */
  private mayNote(id: string): boolean {
    const now = Date.now();
    const recent = (this.notes.get(id) ?? []).filter((at) => now - at < NOTE_WINDOW_MS);
    if (recent.length >= NOTES_PER_WINDOW) {
      this.notes.set(id, recent);
      return false;
    }
    this.notes.set(id, [...recent, now]);
    return true;
  }

  private recordFailure(id: string): void {
    const now = Date.now();
    this.failures.set(id, [
      ...(this.failures.get(id) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS),
      now,
    ]);
  }

  private failing(id: string): boolean {
    const now = Date.now();
    return (
      (this.failures.get(id) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS).length >=
      FAILURES_ALLOWED
    );
  }

  private touch(id: string): void {
    const known = this.idle.get(id);
    if (known) {
      clearTimeout(known);
    }
    const timer = setTimeout(() => {
      void this.stop(id);
    }, this.config.pluginLimits.idleMs);
    timer.unref();
    this.idle.set(id, timer);
  }

  /** The running process of a plugin, started if there is none. A plugin with only declarative parts has none. */
  private async ensure(
    id: string,
    runnable: Runnable,
    options: { readonly ignoreFailures: boolean },
  ): Promise<PluginProcess | undefined> {
    const manifest = runnable.plugin.manifest;
    const modules = (manifest?.provides ?? []).flatMap((p) =>
      p.entry === undefined ? [] : [{ kind: p.kind, entry: p.entry.replace(/^\.\//u, '') }],
    );
    if (modules.length === 0) {
      return undefined;
    }
    const known = this.processes.get(id);
    if (known?.running === true) {
      this.touch(id);
      return known;
    }
    const pending = this.starting.get(id);
    if (pending) {
      return pending;
    }
    if (!options.ignoreFailures && this.failing(id)) {
      throw new PluginCallError(
        'The plugin keeps failing and is left alone for a minute.',
        'failed',
      );
    }
    const start = PluginProcess.start({
      pluginId: id,
      directory: runnable.plugin.directory,
      modules,
      network: runnable.network,
      gateway: this.gateway,
      runnerPath: RUNNER,
      memoryMiB: this.config.pluginLimits.memoryMiB,
      startTimeoutMs: START_TIMEOUT_MS,
      onChange: (snapshot) => this.runtime.report(id, snapshot),
      onRefused: (host, reason) => {
        if (this.mayNote(id)) {
          void this.audit.note({
            action: 'plugin.network.denied',
            outcome: 'denied',
            actor: null,
            object: { type: 'plugin', id },
            details: { host: host.slice(0, 200), reason },
            meta: { ip: undefined, requestId: undefined },
          });
        }
      },
    });
    this.starting.set(id, start);
    try {
      const started = await start;
      this.processes.set(id, started);
      this.runtime.report(id, started.snapshot());
      this.touch(id);
      return started;
    } catch (error) {
      this.recordFailure(id);
      this.runtime.report(id, {
        state: 'failed',
        startedAt: null,
        calls: 0,
        lastError: error instanceof Error ? error.message.slice(0, 300) : 'It did not start.',
        modules: [],
      });
      throw error;
    } finally {
      this.starting.delete(id);
    }
  }

  /**
   * Calls a method of an enabled plugin. The files are verified against the approval first; a call that takes
   * longer than the deadline ends the process and fails.
   */
  async call(id: string, kind: string, method: string, params: unknown): Promise<unknown> {
    const runnable = await this.plugins.runnable(id);
    if (runnable.kind !== 'ok') {
      throw new PluginCallError(
        runnable.kind === 'unknown' ? 'There is no such plugin.' : `The plugin does not run: ${runnable.why}.`,
        'not_running',
      );
    }
    const running = await this.ensure(id, runnable, { ignoreFailures: false });
    if (running === undefined) {
      throw new PluginCallError('The plugin has no code to run.', 'not_running');
    }
    try {
      return await running.call(kind, method, params, this.config.pluginLimits.callTimeoutMs);
    } catch (error) {
      if (error instanceof PluginCallError && (error.reason === 'timeout' || error.reason === 'crashed')) {
        this.recordFailure(id);
        if (this.mayNote(id)) {
          void this.audit.note({
            action: 'plugin.failed',
            outcome: 'failure',
            actor: null,
            object: { type: 'plugin', id },
            details: { reason: error.reason, method: method.slice(0, 64) },
            meta: { ip: undefined, requestId: undefined },
          });
        }
      }
      throw error;
    } finally {
      this.runtime.report(id, running.snapshot());
    }
  }

  /** Loads the plugin in its restricted process and records the result; the answer is the plugin as it is then. */
  async check(actor: Actor, id: string, meta: RequestMeta): Promise<PluginView> {
    const runnable = await this.plugins.runnable(id);
    if (runnable.kind === 'unknown') {
      throw new NotFoundException('There is no such plugin.');
    }
    if (runnable.kind === 'not_enabled') {
      throw new ConflictException(`Enable the plugin before checking it: ${runnable.why}.`);
    }
    let outcome: 'success' | 'failure' = 'success';
    let details: Record<string, string | number> = {};
    try {
      const running = await this.ensure(id, runnable, { ignoreFailures: true });
      const modules = running?.snapshot().modules ?? [];
      details = {
        modules: modules.length,
        methods: modules.reduce((sum, m) => sum + m.methods.length, 0),
      };
    } catch (error) {
      outcome = 'failure';
      details = {
        reason: (error instanceof Error ? error.message : 'The plugin did not load.').slice(0, 200),
      };
      this.logger.warn(`check of ${id} failed: ${String(details['reason'])}`);
    }
    await this.audit.record({
      action: 'plugin.checked',
      outcome,
      actor,
      object: { type: 'plugin', id },
      details,
      meta,
    });
    return this.plugins.viewById(id);
  }

  /** Ends the plugin's process, if it has one. Called when a plugin is switched off or changes. */
  async stop(id: string): Promise<void> {
    const timer = this.idle.get(id);
    if (timer) {
      clearTimeout(timer);
      this.idle.delete(id);
    }
    const running = this.processes.get(id);
    this.processes.delete(id);
    if (running) {
      await running.stop();
    }
    this.runtime.forget(id);
  }

  /** The process id of a plugin, for the tests that check a stopped plugin is really gone. */
  pidOf(id: string): number | undefined {
    return this.processes.get(id)?.pid;
  }
}
