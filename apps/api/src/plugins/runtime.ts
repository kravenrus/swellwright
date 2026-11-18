import { Injectable } from '@nestjs/common';

import type { RuntimeSnapshot } from './host/process.js';

const STOPPED: RuntimeSnapshot = {
  state: 'stopped',
  startedAt: null,
  calls: 0,
  lastError: null,
  modules: [],
};

/**
 * What the plugin processes are doing, shared between the service that lists plugins (it shows it, and asks
 * for a process to be stopped when a plugin is switched off) and the host that runs them (it reports and
 * obeys). Neither knows the other, so neither needs the other to exist.
 */
@Injectable()
export class PluginRuntime {
  private readonly snapshots = new Map<string, RuntimeSnapshot>();
  private readonly stopHandlers: ((pluginId: string) => void)[] = [];

  snapshotOf(pluginId: string): RuntimeSnapshot {
    return this.snapshots.get(pluginId) ?? STOPPED;
  }

  report(pluginId: string, snapshot: RuntimeSnapshot): void {
    this.snapshots.set(pluginId, snapshot);
  }

  forget(pluginId: string): void {
    this.snapshots.delete(pluginId);
  }

  /** The host registers here to be told when a plugin must stop. */
  onStop(handler: (pluginId: string) => void): void {
    this.stopHandlers.push(handler);
  }

  /** A plugin was switched off, changed or removed: whatever is running for it must end now. */
  requestStop(pluginId: string): void {
    for (const handler of this.stopHandlers) {
      handler(pluginId);
    }
    this.forget(pluginId);
  }
}
