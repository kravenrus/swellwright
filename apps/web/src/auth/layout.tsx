import { Card, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { Logo } from '@swellwright/ui';

/** The frame of every screen before sign-in: the brand, one card, an optional line below. */
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
    <main className="sw-auth">
      <div className="sw-auth-inner">
        <div className="sw-auth-brand">
          <Logo />
        </div>
        <Card padding="xl">
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
          </Stack>
        </Card>
        {footer}
      </div>
    </main>
  );
}
