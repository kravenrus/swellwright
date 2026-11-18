import { ActionIcon, Badge, Group, Menu, Text } from '@mantine/core';
import {
  IconBell,
  IconCheck,
  IconKey,
  IconLanguage,
  IconLogout,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionInfo } from '@swellwright/contracts';
import { LANGUAGES, LANGUAGE_NAMES, isLanguage } from '@swellwright/i18n';
import { AppHeader, HeaderIconButton } from '@swellwright/ui';

import { ChangePasswordDialog } from './auth/change-password.js';
import { AuthGate } from './auth/gate.js';
import { StepUpProvider } from './auth/step-up.js';
import { setLanguage } from './i18n.js';
import { navFor } from './nav.js';
import { Overview } from './overview.js';
import { AuditPage } from './security/audit-page.js';
import { RolesPage } from './security/roles-page.js';
import { SessionsPage } from './security/sessions-page.js';
import { TokensPage } from './security/tokens-page.js';
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
  const { t, i18n } = useTranslation(['common', 'roles']);
  return (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target>
        <ActionIcon aria-label={t('account')} color="gray" size={36}>
          <IconUser size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} fz="sm">
              {session.user.displayName ?? session.user.username}
            </Text>
            <Badge size="xs">{t(`roles:names.${session.user.role}`)}</Badge>
          </Group>
        </Menu.Label>
        <Menu.Item leftSection={<IconKey size={16} />} onClick={onChangePassword}>
          {t('changePassword')}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>
          <Group gap={6} wrap="nowrap">
            <IconLanguage size={14} />
            {t('language')}
          </Group>
        </Menu.Label>
        {LANGUAGES.map((language) => (
          <Menu.Item
            key={language}
            leftSection={
              i18n.language === language ? <IconCheck size={16} /> : <span style={{ width: 16 }} />
            }
            lang={language}
            onClick={() => {
              if (isLanguage(language)) {
                void setLanguage(language);
              }
            }}
          >
            {LANGUAGE_NAMES[language]}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLogout size={16} />}
          onClick={() => {
            void onSignOut();
          }}
        >
          {t('signOut')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function Console({ session, signOut }: { session: SessionInfo; signOut: () => Promise<void> }) {
  const { t } = useTranslation(['common', 'nav']);
  const [activeId, setActiveId] = useState('overview');
  const { permissions } = session;
  return (
    <StepUpProvider>
      <AppHeader
        activeId={activeId}
        controls={
          <>
            <HeaderIconButton icon={IconSearch} label={t('searchAndCommands')} />
            <HeaderIconButton icon={IconBell} label={t('alerts')} />
            <AccountMenu onSignOut={signOut} session={session} />
          </>
        }
        navLabel={t('mainNavigation')}
        onNavigate={setActiveId}
        sections={navFor(permissions, t)}
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
        {activeId === 'sessions' ? (
          <SessionsPage currentUserId={session.user.id} permissions={permissions} />
        ) : null}
        {activeId === 'tokens' ? (
          <TokensPage permissions={permissions} role={session.user.role} />
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
