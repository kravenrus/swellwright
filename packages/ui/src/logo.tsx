import { Group, Text } from '@mantine/core';

/** The mark: a pointy-top hexagon cut by two parallel waves. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden fill="none" height={size} viewBox="0 0 40 40" width={size}>
      <polygon
        points="20,3 34.7,11.5 34.7,28.5 20,37 5.3,28.5 5.3,11.5"
        stroke="var(--mantine-color-cyan-4)"
        strokeWidth="2"
      />
      <path
        d="M11 17q4.5 -4 9 0t9 0"
        stroke="var(--mantine-color-cyan-4)"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M11 23.5q4.5 -4 9 0t9 0"
        stroke="var(--mantine-color-blue-4)"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <Group gap="xs" wrap="nowrap">
      <LogoMark />
      <Text c="white" fw={700} fz={18}>
        Swellwright
      </Text>
    </Group>
  );
}
