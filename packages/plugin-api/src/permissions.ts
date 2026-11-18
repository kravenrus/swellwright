import type { PluginPermissions } from './manifest.js';

export interface ListChange {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** What an update changes in what a plugin may do. The administrator sees this before the update is applied. */
export interface PermissionDiff {
  readonly network: ListChange;
  readonly secrets: ListChange;
  readonly panel: ListChange;
  readonly ssh: 'granted' | 'revoked' | 'unchanged';
}

const EMPTY: PluginPermissions = { network: [], secrets: [], panel: [], ssh: false };

function change(before: readonly string[], after: readonly string[]): ListChange {
  const had = new Set(before);
  const has = new Set(after);
  return {
    added: [...has].filter((item) => !had.has(item)).sort(),
    removed: [...had].filter((item) => !has.has(item)).sort(),
  };
}

/** Compares the permissions of the installed version (or none, for a new plugin) with those of a new one. */
export function permissionDiff(
  before: PluginPermissions | undefined,
  after: PluginPermissions,
): PermissionDiff {
  const old = before ?? EMPTY;
  let ssh: PermissionDiff['ssh'] = 'unchanged';
  if (!old.ssh && after.ssh) {
    ssh = 'granted';
  } else if (old.ssh && !after.ssh) {
    ssh = 'revoked';
  }
  return {
    network: change(old.network, after.network),
    secrets: change(old.secrets, after.secrets),
    panel: change(old.panel, after.panel),
    ssh,
  };
}

/** True when the new version may do more than the old one. Only that needs the administrator's approval again. */
export function widensPermissions(diff: PermissionDiff): boolean {
  return (
    diff.network.added.length > 0 ||
    diff.secrets.added.length > 0 ||
    diff.panel.added.length > 0 ||
    diff.ssh === 'granted'
  );
}
