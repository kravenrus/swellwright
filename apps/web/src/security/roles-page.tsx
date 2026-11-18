import { Alert, Badge, Card, Group, Skeleton, Stack, Table, Text } from '@mantine/core';
import { IconCheck, IconMinus, IconUserShield } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

import type { UserRole } from '@swellwright/contracts';
import { PageHeader } from '@swellwright/ui';

import { getRoles } from '../api.js';
import { describeError } from '../auth/messages.js';

/** The built-in roles and what each may do, as a matrix. Read-only: the sets are fixed in code (ADR 0015). */
export function RolesPage({ currentRole }: { currentRole: UserRole }) {
  const catalog = useQuery({ queryKey: ['roles'], queryFn: getRoles, retry: false });

  return (
    <>
      <PageHeader
        description="Built-in roles and the permissions each one holds"
        icon={<IconUserShield size={22} />}
        title="Roles"
      />

      {catalog.isPending ? (
        <Stack gap="xs">
          <Skeleton h={28} />
          <Skeleton h={28} />
          <Skeleton h={28} />
        </Stack>
      ) : catalog.isError ? (
        <Alert color="red" variant="light">
          {describeError(
            catalog.error,
            'Sign in again to continue.',
            'Your role may not see this page.',
          )}
        </Alert>
      ) : (
        <Stack gap="md">
          <Card padding={0}>
            <Table.ScrollContainer minWidth={680}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th pl="md">Permission</Table.Th>
                    {catalog.data.roles.map((role) => (
                      <Table.Th key={role.id} ta="center">
                        <Group gap={6} justify="center" wrap="nowrap">
                          {role.id}
                          {role.id === currentRole ? <Badge size="xs">you</Badge> : null}
                        </Group>
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {catalog.data.permissions.map((permission) => (
                    <Table.Tr key={permission.id}>
                      <Table.Td pl="md">
                        <Text ff="monospace" fz="sm">
                          {permission.id}
                        </Text>
                        <Text c="dimmed" fz="xs">
                          {permission.description}
                        </Text>
                      </Table.Td>
                      {catalog.data.roles.map((role) => {
                        const held = role.permissions.includes(permission.id);
                        return (
                          <Table.Td key={role.id} ta="center">
                            {held ? (
                              <IconCheck
                                aria-label={`${role.id} has ${permission.id}`}
                                color="var(--mantine-color-teal-4)"
                                size={18}
                              />
                            ) : (
                              <IconMinus
                                aria-label={`${role.id} does not have ${permission.id}`}
                                color="var(--mantine-color-dark-3)"
                                size={16}
                              />
                            )}
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          <Card padding="md">
            <Stack gap="sm">
              {catalog.data.roles.map((role) => (
                <div key={role.id}>
                  <Text fw={600} fz="sm">
                    {role.id}
                  </Text>
                  <Text c="dimmed" fz="sm">
                    {role.description}
                  </Text>
                </div>
              ))}
              <Text c="dimmed" fz="xs">
                The roles are fixed. Custom roles come with user management. Permissions of pages
                that are not built yet are listed so the roles stay stable.
              </Text>
            </Stack>
          </Card>
        </Stack>
      )}
    </>
  );
}
