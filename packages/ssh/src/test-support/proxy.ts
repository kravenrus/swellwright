// A TCP forwarder that can be cut: tests put it between the client and a server to simulate a network failure
// (every connection through it dies at once, with no SSH-level goodbye), whatever the server behind it is.

import { connect, createServer, type Socket } from 'node:net';

export interface CuttableProxy {
  host: string;
  port: number;
  /** Destroys every connection that goes through the proxy, both directions, at once. */
  cut: () => void;
  close: () => Promise<void>;
}

export async function startCuttableProxy(
  targetHost: string,
  targetPort: number,
): Promise<CuttableProxy> {
  const pairs = new Set<Socket>();
  const server = createServer((inbound) => {
    const outbound = connect({ host: targetHost, port: targetPort });
    pairs.add(inbound);
    pairs.add(outbound);
    const drop = (): void => {
      inbound.destroy();
      outbound.destroy();
      pairs.delete(inbound);
      pairs.delete(outbound);
    };
    inbound.on('error', drop);
    outbound.on('error', drop);
    inbound.on('close', drop);
    outbound.on('close', drop);
    inbound.pipe(outbound);
    outbound.pipe(inbound);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The proxy has no address.');
  const cut = (): void => {
    for (const socket of pairs) socket.destroy();
    pairs.clear();
  };
  return {
    host: '127.0.0.1',
    port: address.port,
    cut,
    close: async () => {
      cut();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}
