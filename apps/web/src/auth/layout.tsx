import { Box, Center, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { LogoMark } from '@swellwright/ui';

/**
 * The frame of every screen before sign-in, as the panel's login page: no header and no card, the brand above a
 * column of form. The panel has one screen; here each step (sign in, authenticator, recovery codes, setup,
 * invitation) names itself under the brand.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Center component="main" mih="100vh" p="md">
      <Stack align="center" gap="xs" maw="100%">
        <Group align="center" gap={4} justify="center" wrap="nowrap">
          <LogoMark className="sw-brand-mark" size={48} />
          <Title ff="Unbounded" order={1} pos="relative">
            <Text c="cyan" component="span" fw="inherit" fz="inherit" inherit pos="relative">
              Swell
            </Text>
            <Text c="white" component="span" fw="inherit" fz="inherit" inherit pos="relative">
              wright
            </Text>
          </Title>
        </Group>
        <Box maw={800} p={30} w={{ base: '100%', sm: 500 }}>
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={3}>{title}</Title>
              {description ? (
                <Text c="dimmed" fz="sm">
                  {description}
                </Text>
              ) : null}
            </Stack>
            {children}
            {footer}
          </Stack>
        </Box>
      </Stack>
    </Center>
  );
}
