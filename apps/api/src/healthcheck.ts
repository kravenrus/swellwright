// The container health check: asks the running process whether it serves requests. Exit code 0 is healthy.
// It reads the same port variable as the server and talks to the loopback address inside the container.
const port = process.env['SW_HTTP_PORT'] ?? '3000';

try {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
    signal: AbortSignal.timeout(3000),
  });
  process.exit(response.ok ? 0 : 1);
} catch {
  process.exit(1);
}
