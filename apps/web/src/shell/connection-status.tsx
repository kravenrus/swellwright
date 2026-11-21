// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/connection-status-overlay/
// {connection-status-overlay.tsx,use-connection-probe.ts} and src/shared/api/connection-watchdog.ts.
// Changes: the panel's axios interceptors became two calls the API client makes; the probe asks the public health
// route; the texts come from i18n.
import { Box, Group, Loader, Paper, Stack, Text, ThemeIcon, Transition } from '@mantine/core';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { PiWifiSlash } from 'react-icons/pi';

/** Three calls in a row that got no answer at all mean the API is gone. */
const FAILURE_THRESHOLD = 3;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;

let consecutiveFailures = 0;

/** The API answered (with anything, an error included): it is there. */
export function reportApiReachable(): void {
  consecutiveFailures = 0;
}

/**
 * A call got no answer. After three in a row the console goes "offline": React Query pauses its calls and the
 * overlay shows until the probe below gets an answer.
 */
export function reportApiUnreachable(): void {
  if (onlineManager.isOnline()) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      consecutiveFailures = 0;
      onlineManager.setOnline(false);
    }
  }
}

const subscribe = (onStoreChange: () => void): (() => void) =>
  onlineManager.subscribe(onStoreChange);
const getSnapshot = (): boolean => onlineManager.isOnline();

/** While offline, asks the API's health route again and again, with growing pauses, until it answers. */
function useConnectionProbe(): { isOnline: boolean } {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot);

  useQuery({
    queryKey: ['connection-probe'],
    enabled: !isOnline,
    networkMode: 'always',
    retry: true,
    retryDelay: (attemptIndex) =>
      Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attemptIndex, MAX_RETRY_DELAY_MS),
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      // A JSON answer, an error status included, means the API is there. No answer, or a proxy's error page, does not.
      const response = await fetch('/api/v1/health', {
        signal: AbortSignal.any([signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)]),
      });
      await response.json();
      onlineManager.setOnline(true);
      return true;
    },
  });

  return { isOnline };
}

/** A pill at the top center of the window while the API cannot be reached. */
export function ConnectionStatusOverlay() {
  const { t } = useTranslation('shell');
  const { isOnline } = useConnectionProbe();

  return (
    <Transition duration={150} mounted={!isOnline} timingFunction="ease" transition="slide-down">
      {(transitionStyles) => (
        <Box
          style={{
            display: 'flex',
            inset: '16px 0 auto 0',
            justifyContent: 'center',
            pointerEvents: 'none',
            position: 'fixed',
            zIndex: 'var(--mantine-z-index-max)',
          }}
        >
          <Paper
            p="sm"
            radius="md"
            role="status"
            shadow="xl"
            style={{
              ...transitionStyles,
              background:
                'linear-gradient(135deg, rgba(30, 30, 35, 0.98) 0%, rgba(45, 25, 25, 0.98) 100%)',
              border: '1px solid rgba(250, 82, 82, 0.35)',
              pointerEvents: 'auto',
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon
                color="red"
                size="lg"
                style={{
                  background: 'rgba(250, 82, 82, 0.1)',
                  border: '1px solid rgba(250, 82, 82, 0.3)',
                }}
                variant="light"
              >
                <PiWifiSlash size="20px" />
              </ThemeIcon>
              <Stack gap={2}>
                <Text fw={600} size="sm">
                  {t('connection.lost')}
                </Text>
                <Group gap={6}>
                  <Loader color="red" size={12} />
                  <Text c="dimmed" size="xs">
                    {t('connection.reconnecting')}
                  </Text>
                </Group>
              </Stack>
            </Group>
          </Paper>
        </Box>
      )}
    </Transition>
  );
}
