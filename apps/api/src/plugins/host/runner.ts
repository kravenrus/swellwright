/**
 * Runs INSIDE a plugin's process (ADR 0028). Everything the plugin may do, it does here, under the Node
 * permission model: it reads its own directory and this file and nothing else, has no network, no child
 * processes, no workers and no code generation from strings. This file imports nothing from the application:
 * the process may read only these two places, and a plugin must not be able to learn how the core is built.
 *
 * The protocol over the IPC channel, JSON messages:
 *   core -> plugin   { type: 'call', id, kind, method, params }
 *                    { type: 'fetched', id, ok: true, status, headers, body } | { type: 'fetched', id, ok: false, message }
 *   plugin -> core   { type: 'ready', modules: { [kind]: string[] } } | { type: 'failed', message }
 *                    { type: 'result', id, value } | { type: 'error', id, message }
 *                    { type: 'fetch', id, url, init }
 */
import type { PluginContext, PluginFetchInit, PluginFetchResponse } from '@swellwright/plugin-api';

const MAX_MESSAGE_CHARS = 500;

type Method = (params: unknown, context: PluginContext) => unknown;

interface Waiting {
  readonly resolve: (value: PluginFetchResponse) => void;
  readonly reject: (error: Error) => void;
}

const modules = new Map<string, Record<string, Method>>();
const fetching = new Map<number, Waiting>();
let nextFetch = 1;

function send(message: unknown): void {
  if (process.send === undefined) {
    throw new Error('This file is run by the Swellwright core and has no other use.');
  }
  process.send(message);
}

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, MAX_MESSAGE_CHARS);
}

function responseOf(status: number, headers: Record<string, string>, body: string): PluginFetchResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
  };
}

function contextOf(pluginId: string): PluginContext {
  return {
    pluginId,
    fetch: (url: string, init?: PluginFetchInit) =>
      new Promise<PluginFetchResponse>((resolve, reject) => {
        const id = nextFetch++;
        fetching.set(id, { resolve, reject });
        send({ type: 'fetch', id, url, init: init ?? {} });
      }),
  };
}

interface FetchedMessage {
  readonly id: number;
  readonly ok: boolean;
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly message?: string;
}

function settleFetch(message: FetchedMessage): void {
  const waiting = fetching.get(message.id);
  if (waiting === undefined) {
    return;
  }
  fetching.delete(message.id);
  if (message.ok) {
    waiting.resolve(responseOf(message.status ?? 0, message.headers ?? {}, message.body ?? ''));
  } else {
    waiting.reject(new Error(message.message ?? 'The request was refused.'));
  }
}

interface CallMessage {
  readonly id: number;
  readonly kind: string;
  readonly method: string;
  readonly params: unknown;
}

async function handleCall(pluginId: string, message: CallMessage): Promise<void> {
  const methods = modules.get(message.kind);
  // Own properties only: `constructor` and `toString` are not methods of the plugin.
  if (methods === undefined || !Object.hasOwn(methods, message.method)) {
    send({
      type: 'error',
      id: message.id,
      message: `The plugin has no method "${message.method}" for ${message.kind}.`,
    });
    return;
  }
  try {
    const value = await (methods[message.method] as Method)(message.params, contextOf(pluginId));
    send({ type: 'result', id: message.id, value: value === undefined ? null : value });
  } catch (error) {
    send({ type: 'error', id: message.id, message: describe(error) });
  }
}

async function load(pluginId: string, specs: readonly string[]): Promise<void> {
  const listing: Record<string, string[]> = {};
  for (const spec of specs) {
    const at = spec.indexOf('=');
    const kind = spec.slice(0, at);
    const loaded = (await import(spec.slice(at + 1))) as { default?: unknown };
    const exported = (loaded.default ?? loaded) as { methods?: unknown };
    const found = exported.methods;
    if (typeof found !== 'object' || found === null) {
      throw new Error(`The module for ${kind} exports no "methods" object.`);
    }
    const methods: Record<string, Method> = {};
    for (const [name, method] of Object.entries(found)) {
      if (typeof method !== 'function') {
        throw new Error(`"${name}" of ${kind} is not a function.`);
      }
      methods[name] = method as Method;
    }
    modules.set(kind, methods);
    listing[kind] = Object.keys(methods).sort();
  }
  process.on('message', (message: { type?: string } & Record<string, unknown>) => {
    if (message.type === 'call') {
      void handleCall(pluginId, message as unknown as CallMessage);
    } else if (message.type === 'fetched') {
      settleFetch(message as unknown as FetchedMessage);
    }
  });
  send({ type: 'ready', modules: listing });
}

const [pluginId, ...specs] = process.argv.slice(2);
try {
  await load(pluginId ?? '', specs);
} catch (error) {
  send({ type: 'failed', message: describe(error) });
  // Give the message a moment to leave; the core kills the process on `failed` anyway.
  setTimeout(() => process.exit(1), 100);
}
