import { Center, Progress, Stack, Text } from '@mantine/core';

/** The page loading state of the panel: a striped, animated cyan bar. */
export function LoadingScreen({
  height = '100dvh',
  text,
}: {
  /** CSS height of the area the bar is centered in; the fixed header is subtracted. */
  height?: string;
  text?: string;
}) {
  return (
    <Center
      className="sw-loading"
      style={{ height: `calc(${height} - var(--app-shell-header-height, 0px) - 20px)` }}
    >
      <Stack align="center" gap="xs" w="100%">
        {text ? <Text size="lg">{text}</Text> : null}
        <Progress animated color="cyan" maw="32rem" radius="xs" striped value={100} w="80%" />
      </Stack>
    </Center>
  );
}
