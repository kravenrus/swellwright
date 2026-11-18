import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import { IconBell, IconKey, IconLogout, IconSearch, IconUser } from '@tabler/icons-react';
import { useState } from 'react';

import type { SessionInfo } from '@swellwright/contracts';
import { AppHeader, HeaderIconButton } from '@swellwright/ui';

import { ChangePasswordDialog } from './auth/change-password.js';
import { AuthGate } from './auth/gate.js';
import { StepUpProvider } from './auth/step-up.js';
import { navFor } from './nav.js';
import { Overview } from './overview.js';
import { AuditPage } from './security/audit-page.js';
import { RolesPage } from './security/roles-page.js';
import { UsersPage } from './security/users-page.js';
import { VaultPage } from './security/vault-page.js';

function AccountMenu({
  session,
  onSignOut,
}: {
  session: SessionInfo;
  onSignOut: () => Promise<void>;
}) {
  const [changing, setChanging] = useState(false);
  return (
    <>
      <ChangePasswordDialog
        onClose={() => {
          setChanging(false);
        }}
        opened={changing}
      />
      <AccountDropdown
        onChangePassword={() => {
          setChanging(true);
        }}
        onSignOut={onSignOut}
        session={session}
      />
    </>
  );
}

function AccountDropdown({
  session,
  onSignOut,
  onChangePassword,
}: {
  session: SessionInfo;
  onSignOut: () => Promise<void>;
  onChangePassword: () => void;
}) {
  return (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target>
        <ActionIcon aria-label="Account" color="gray" size={36}>
          <IconUser size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} fz="sm">
              {session.user.displayName ?? session.user.username}
            </Text>
            <Badge size="xs">{session.user.role}</Badge>
          </Group>
        </Menu.Label>
        <Menu.Item leftSection={<IconKey size={16} />} onClick={onChangePassword}>
          Change password
        </Menu.Item>
        <Menu.Item
          leftSection={<IconLogout size={16} />}
          onClick={() => {
            void onSignOut();
          }}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function Console({ session, signOut }: { session: SessionInfo; signOut: () => Promise<void> }) {
  const [activeId, setActiveId] = useState('overview');
  const { permissions } = session;
  return (
    <StepUpProvider>
      <AppHeader
        activeId={activeId}
        controls={
          <>
            <HeaderIconButton icon={IconSearch} label="Search and commands" />
            <HeaderIconButton icon={IconBell} label="Alerts" />
            <AccountMenu onSignOut={signOut} session={session} />
          </>
        }
        onNavigate={setActiveId}
        sections={navFor(permissions)}
      />
      <main className="sw-page">
        {activeId === 'overview' ? <Overview /> : null}
        {activeId === 'vault' && permissions.includes('vault:read') ? (
          <VaultPage permissions={permissions} />
        ) : null}
        {activeId === 'users' && permissions.includes('users:read') ? (
          <UsersPage currentUserId={session.user.id} permissions={permissions} />
        ) : null}
        {activeId === 'roles' && permissions.includes('roles:read') ? (
          <RolesPage currentRole={session.user.role} />
        ) : null}
        {activeId === 'audit' && permissions.includes('audit:read') ? (
          <AuditPage permissions={permissions} />
        ) : null}
      </main>
    </StepUpProvider>
  );
}

export function App() {
  return (
    <AuthGate>{(session, signOut) => <Console session={session} signOut={signOut} />}</AuthGate>
  );
}
