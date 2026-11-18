import { Alert, Badge, Card, Group, Skeleton, Stack, Table, Text } from '@mantine/core';
import { IconCheck, IconMinus, IconUserShield } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { Permission, UserRole } from '@swellwright/contracts';
import type { resources } from '@swellwright/i18n';
import { PageHeader } from '@swellwright/ui';

import { getRoles } from '../api.js';
import { describeError } from '../auth/messages.js';

type PermissionKey = keyof (typeof resources)['en']['roles']['permissionDescriptions'];

/**
 * The key of the text of each permission. A colon cannot be part of a key, so `servers:read` is `serversRead`.
 * Typed against both sides: a permission added to the contracts without a text here fails the build.
 */
const PERMISSION_KEY = {
  'servers:read': 'serversRead',
  'servers:write': 'serversWrite',
  'panel:read': 'panelRead',
  'panel:write': 'panelWrite',
  'runs:read': 'runsRead',
  'runs:execute': 'runsExecute',
  'vault:read': 'vaultRead',
  'vault:manage': 'vaultManage',
  'vault:reveal': 'vaultReveal',
  'terminal:use': 'terminalUse',
  'users:read': 'usersRead',
  'users:write': 'usersWrite',
  'roles:read': 'rolesRead',
  'audit:read': 'auditRead',
  'audit:verify': 'auditVerify',
  'audit:export': 'auditExport',
  'sessions:read': 'sessionsRead',
  'sessions:revoke': 'sessionsRevoke',
  'tokens:create': 'tokensCreate',
  'tokens:read': 'tokensRead',
  'tokens:revoke': 'tokensRevoke',
  'plugins:read': 'pluginsRead',
  'plugins:manage': 'pluginsManage',
} as const satisfies Record<Permission, PermissionKey>;

/**
 * The texts the console has for a role or a permission, by id. The id is typed, so a wrong key fails the build
 * (a `defaultValue` would switch that check off, hence `exists`). An id the console does not know yet, because
 * the server is newer, shows the text the API sent.
 */
export function useCatalogText() {
  const { t, i18n } = useTranslation('roles');
  return {
    roleName: (id: UserRole): string => (i18n.exists(`roles:names.${id}`) ? t(`names.${id}`) : id),
    roleDescription: (id: UserRole, sent: string): string =>
      i18n.exists(`roles:roleDescriptions.${id}`) ? t(`roleDescriptions.${id}`) : sent,
    permissionDescription: (id: Permission, sent: string): string => {
      const key = PERMISSION_KEY[id];
      return i18n.exists(`roles:permissionDescriptions.${key}`)
        ? t(`permissionDescriptions.${key}`)
        : sent;
    },
  };
}

/**
 * The built-in roles and what each may do, as a matrix. Read-only: the sets are fixed in code (ADR 0015).
 */
export function RolesPage({ currentRole }: { currentRole: UserRole }) {
  const { t } = useTranslation('roles');
  const text = useCatalogText();
  const catalog = useQuery({ queryKey: ['roles'], queryFn: getRoles, retry: false });

  return (
    <>
      <PageHeader
        description={t('header.description')}
        icon={<IconUserShield size={22} />}
        title={t('header.title')}
      />

      {catalog.isPending ? (
        <Stack gap="xs">
          <Skeleton h={28} />
          <Skeleton h={28} />
          <Skeleton h={28} />
        </Stack>
      ) : catalog.isError ? (
        <Alert color="red" variant="light">
          {describeError(t, catalog.error, t('signInAgain'), t('forbidden'))}
        </Alert>
      ) : (
        <Stack gap="md">
          <Card padding={0}>
            <Table.ScrollContainer minWidth={680}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th pl="md">{t('permissionColumn')}</Table.Th>
                    {catalog.data.roles.map((role) => (
                      <Table.Th key={role.id} ta="center">
                        <Group gap={6} justify="center" wrap="nowrap">
                          {text.roleName(role.id)}
                          {role.id === currentRole ? <Badge size="xs">{t('you')}</Badge> : null}
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
                          {text.permissionDescription(permission.id, permission.description)}
                        </Text>
                      </Table.Td>
                      {catalog.data.roles.map((role) => {
                        const held = role.permissions.includes(permission.id);
                        const names = {
                          role: text.roleName(role.id),
                          permission: permission.id,
                        };
                        return (
                          <Table.Td key={role.id} ta="center">
                            {held ? (
                              <IconCheck
                                aria-label={t('held', names)}
                                color="var(--mantine-color-teal-4)"
                                size={18}
                              />
                            ) : (
                              <IconMinus
                                aria-label={t('notHeld', names)}
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
                    {text.roleName(role.id)}
                  </Text>
                  <Text c="dimmed" fz="sm">
                    {text.roleDescription(role.id, role.description)}
                  </Text>
                </div>
              ))}
              <Text c="dimmed" fz="xs">
                {t('note')}
              </Text>
            </Stack>
          </Card>
        </Stack>
      )}
    </>
  );
}
