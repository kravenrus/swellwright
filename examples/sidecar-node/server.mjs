// A reference sidecar for Swellwright (ADR 0031): the smallest container that speaks the protocol, in Node.
// It offers one extension kind with two methods, and shows how to use the core's gateway for the network, a secret
// and storage. Copy it, change `METHODS`, build an image, pin it by digest and describe it in your manifest.
//
// The core talks to it over HTTP on an internal network:
//   GET  /describe  -> { modules: [{ kind, methods: [...] }] }
//   POST /call      -> body { kind, method, params, config }, answer { ok: true, value } | { ok: false, message }
// Every request carries `Authorization: Bearer <SW_PLUGIN_TOKEN>`; anything else gets 401.
//
// The container has no way out of its network. To reach the world it asks the core, with the same token:
//   POST {SW_CORE_URL}/api/v1/plugins/{SW_PLUGIN_ID}/gateway
//     { op: 'fetch', url, init }            -> the request is made by the core, only to hosts the administrator approved
//     { op: 'secret', field }               -> the vault secret bound to a settings field of the plugin
//     { op: 'storage', action, key, value } -> the plugin's own key-value storage
//   answer { ok: true, value } | { ok: false, message }

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const {
  SW_PLUGIN_ID: ID,
  SW_PLUGIN_TOKEN: TOKEN,
  SW_CORE_URL: CORE,
  SW_PLUGIN_PORT: PORT,
} = process.env;
if (!ID || !TOKEN || !CORE || !PORT) {
  throw new Error(
    'SW_PLUGIN_ID, SW_PLUGIN_TOKEN, SW_CORE_URL and SW_PLUGIN_PORT are set by the compose fragment.',
  );
}

/** Asks the core for something. Throws with the core's reason when it refuses. */
async function gateway(request) {
  const response = await fetch(`${CORE}/api/v1/plugins/${ID}/gateway`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(request),
  });
  if (response.status !== 200) {
    throw new Error(`The core answered ${String(response.status)}.`);
  }
  const answer = await response.json();
  if (!answer.ok) {
    throw new Error(answer.message ?? 'The core refused.');
  }
  return answer.value;
}

/** What the container offers: kind -> method -> (params, config) => value. */
const METHODS = {
  DnsProvider: {
    /** Returns what it was given. */
    echo: (params, config) => ({ params, config }),
    /** Counts how many times it was called, in the plugin's storage. */
    counter: async () => {
      const seen = Number((await gateway({ op: 'storage', action: 'get', key: 'calls' })) ?? 0) + 1;
      await gateway({ op: 'storage', action: 'set', key: 'calls', value: seen });
      return { calls: seen };
    },
  },
};

const authorized = (header) => {
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const read = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });

const send = (response, status, body) => {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

createServer(async (request, response) => {
  if (!authorized(request.headers.authorization)) {
    return send(response, 401, {});
  }
  if (request.method === 'GET' && request.url === '/describe') {
    const modules = Object.entries(METHODS).map(([kind, methods]) => ({
      kind,
      methods: Object.keys(methods).sort(),
    }));
    return send(response, 200, { modules });
  }
  if (request.method === 'POST' && request.url === '/call') {
    try {
      const { kind, method, params, config } = JSON.parse(await read(request));
      const handler = Object.hasOwn(METHODS[kind] ?? {}, method)
        ? METHODS[kind][method]
        : undefined;
      if (!handler) {
        return send(response, 200, {
          ok: false,
          message: `There is no method ${String(method)} for ${String(kind)}.`,
        });
      }
      return send(response, 200, { ok: true, value: await handler(params, config) });
    } catch (error) {
      return send(response, 200, {
        ok: false,
        message: error instanceof Error ? error.message : 'It failed.',
      });
    }
  }
  return send(response, 404, {});
}).listen(Number(PORT), '0.0.0.0');
