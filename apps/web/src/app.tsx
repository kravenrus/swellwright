import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import { IconBell, IconLogout, IconSearch, IconUser } from '@tabler/icons-react';
import { useState } from 'react';

import type { SessionInfo } from '@swellwright/contracts';
import { AppHeader, HeaderIconButton } from '@swellwright/ui';

import { AuthGate } from './auth/gate.js';
import { NAV_SECTIONS } from './nav.js';
import { Overview } from './overview.js';

function AccountMenu({
  session,
  onSignOut,
}: {
  session: SessionInfo;
  onSignOut: () => Promise<void>;
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
  return (
    <>
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
        sections={NAV_SECTIONS}
      />
      <main className="sw-page">{activeId === 'overview' ? <Overview /> : null}</main>
    </>
  );
}

export function App() {
  return (
    <AuthGate>{(session, signOut) => <Console session={session} signOut={signOut} />}</AuthGate>
  );
}
