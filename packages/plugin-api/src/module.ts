/**
 * What a plugin's module looks like from the inside (ADR 0028). A module named in `provides[].entry` exports
 * `methods`; the core calls them by name, in a process of their own that can touch only the plugin's directory:
 * no network, no child processes, no environment of the core. The one door out is `context.fetch`, which goes
 * through the core and reaches only the hosts the administrator approved.
 */

export interface PluginFetchInit {
  /** `GET` by default. */
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Text only; at most 1 MiB. */
  readonly body?: string;
}

export interface PluginFetchResponse {
  readonly status: number;
  readonly ok: boolean;
  /** Names in lower case. */
  readonly headers: Readonly<Record<string, string>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface PluginContext {
  readonly pluginId: string;
  /**
   * An HTTPS request through the core. Only `host:port` pairs listed in the manifest's `permissions.network`
   * are reachable, redirects are not followed, the answer is text of at most 4 MiB.
   */
  fetch(url: string, init?: PluginFetchInit): Promise<PluginFetchResponse>;
}

export type PluginMethod = (params: unknown, context: PluginContext) => unknown;

export interface PluginModule {
  readonly methods: Readonly<Record<string, PluginMethod>>;
}

/** Gives a module its type: `export default definePlugin({ methods: { ... } })`. */
export const definePlugin = (module: PluginModule): PluginModule => module;

/** Limits that hold for every call, whatever the plugin says (ADR 0028). */
export const PLUGIN_LIMITS = {
  /** A request body a plugin may send through the core. */
  requestBytes: 1024 * 1024,
  /** A response the core hands back. */
  responseBytes: 4 * 1024 * 1024,
  /** Requests a plugin may have in flight through the core. */
  concurrentFetches: 4,
  /** Calls a plugin may have in flight. */
  concurrentCalls: 8,
} as const;
