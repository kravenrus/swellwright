// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/app/layouts/auth/auth.layout.tsx and
// src/pages/auth/login/login.page.tsx. Changes: the brand is Swellwright's; the column is `100%` wide on a phone (the
// panel's 440 px overflows there); a heading is optional and follows the panel's registration form.
import { Badge, Box, Center, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { LogoMark } from '@swellwright/ui';

/**
 * The frame of every screen before sign-in, as the panel's login page (src/pages/auth/login and src/app/layouts/auth):
 * no header and no card, the brand above a column of form that is 500 px wide from `sm` up. The column is the
 * panel's `Container size="100%"` around a `Paper`, so the fields are 408 px wide.
 *
 * The panel's login has no heading. Its first-run screen (the registration form) has a centered level 2 title and a
 * dimmed line under it; `title` and `description` give a screen that heading. The sign-in and the authenticator code
 * screens have none, as the panel's login has none.
 */
export function AuthLayout({
  title,
  description,
  status,
  children,
}: {
  title?: string;
  description?: string;
  /** A badge under the brand, as the panel's "Server is not responding" badge on its login page. */
  status?: string;
  children: ReactNode;
}) {
  return (
    <Center component="main" mih="100vh" p="md">
      <Stack align="center" gap="xs" w="100%">
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
        {status ? (
          <Badge color="cyan" mt={10} size="lg" variant="filled">
            {status}
          </Badge>
        ) : null}
        <Box maw={800} w={{ base: '100%', sm: 500 }}>
          <Container size="100%">
            <Paper p={30}>
              {title ? (
                <Title mb="xs" order={2} ta="center">
                  {title}
                </Title>
              ) : null}
              {description ? (
                <Text c="dimmed" mb="md" size="sm" ta="center">
                  {description}
                </Text>
              ) : null}
              {children}
            </Paper>
          </Container>
        </Box>
      </Stack>
    </Center>
  );
}
