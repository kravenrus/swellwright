import { Button, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLock, IconMapOff } from '@tabler/icons-react';
import { lazy, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, Link, Navigate, type RouteObject } from 'react-router';

import type { Permission } from '@swellwright/contracts';

import { navFor } from './nav.js';
import { ROUTES } from './routes.js';
import { useConsole } from './shell/console-context.js';
import { ConsoleLayout } from './shell/console-layout.js';
import { Page } from './shell/page.js';

// A page chunk is loaded when the page is first opened.
const Overview = lazy(() => import('./overview.js').then((m) => ({ default: m.Overview })));
const VaultPage = lazy(() =>
  import('./security/vault-page.js').then((m) => ({ default: m.VaultPage })),
);
const UsersPage = lazy(() =>
  import('./security/users-page.js').then((m) => ({ default: m.UsersPage })),
);
const RolesPage = lazy(() =>
  import('./security/roles-page.js').then((m) => ({ default: m.RolesPage })),
);
const SessionsPage = lazy(() =>
  import('./security/sessions-page.js').then((m) => ({ default: m.SessionsPage })),
);
const TokensPage = lazy(() =>
  import('./security/tokens-page.js').then((m) => ({ default: m.TokensPage })),
);
const AuditPage = lazy(() =>
  import('./security/audit-page.js').then((m) => ({ default: m.AuditPage })),
);
const PluginsPage = lazy(() =>
  import('./settings/plugins-page.js').then((m) => ({ default: m.PluginsPage })),
);

/** A message in place of a page: the address leads nowhere, or the role does not open it. */
function Notice({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof IconMapOff;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <Center mih="50vh">
      <Stack align="center" gap="sm" maw={440} ta="center">
        <ThemeIcon size={56} variant="soft">
          <Icon size={28} />
        </ThemeIcon>
        <Title order={3}>{title}</Title>
        <Text c="dimmed">{text}</Text>
        {action}
      </Stack>
    </Center>
  );
}

function NotFound() {
  const { t } = useTranslation('shell');
  return (
    <Page title={t('notFound.title')}>
      <Notice
        action={
          <Button component={Link} to={ROUTES.DASHBOARD.HOME}>
            {t('notFound.action')}
          </Button>
        }
        icon={IconMapOff}
        text={t('notFound.text')}
        title={t('notFound.title')}
      />
    </Page>
  );
}

/** A page for people whose role allows it; everyone else sees why they cannot. */
function Guarded({
  permission,
  title,
  children,
}: {
  permission?: Permission;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation('shell');
  const { session } = useConsole();
  if (permission !== undefined && !session.permissions.includes(permission)) {
    return (
      <Page title={t('forbidden.title')}>
        <Notice icon={IconLock} text={t('forbidden.text')} title={t('forbidden.title')} />
      </Page>
    );
  }
  return <Page title={title}>{children}</Page>;
}

/** The index of an area goes to the first page of it that the person may open. */
function AreaIndex({ area }: { area: string }) {
  const { t } = useTranslation(['common', 'nav']);
  const { session } = useConsole();
  const section = navFor(session.permissions, t).find((s) => s.id === area);
  const first = section?.items.find((item) => item.planned !== true);
  return <Navigate replace to={first?.href ?? ROUTES.DASHBOARD.HOME} />;
}

function OverviewRoute() {
  const { t } = useTranslation('nav');
  return (
    <Guarded title={t('overview')}>
      <Overview />
    </Guarded>
  );
}

function VaultRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded permission="vault:read" title={t('vault')}>
      <VaultPage permissions={session.permissions} />
    </Guarded>
  );
}

function UsersRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded permission="users:read" title={t('users')}>
      <UsersPage currentUserId={session.user.id} permissions={session.permissions} />
    </Guarded>
  );
}

function RolesRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded permission="roles:read" title={t('roles')}>
      <RolesPage currentRole={session.user.role} />
    </Guarded>
  );
}

function SessionsRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded title={t('sessions')}>
      <SessionsPage currentUserId={session.user.id} permissions={session.permissions} />
    </Guarded>
  );
}

function TokensRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded title={t('tokens')}>
      <TokensPage permissions={session.permissions} role={session.user.role} />
    </Guarded>
  );
}

function AuditRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded permission="audit:read" title={t('audit')}>
      <AuditPage permissions={session.permissions} />
    </Guarded>
  );
}

function PluginsRoute() {
  const { t } = useTranslation('nav');
  const { session } = useConsole();
  return (
    <Guarded permission="plugins:read" title={t('plugins')}>
      <PluginsPage permissions={session.permissions} />
    </Guarded>
  );
}

const D = ROUTES.DASHBOARD;

/** The paths of a child are relative to the layout route `/dashboard`. */
const relative = (path: string): string => path.slice(`${D.ROOT}/`.length);

export const routes: RouteObject[] = [
  { path: ROUTES.ROOT, element: <Navigate replace to={D.HOME} /> },
  {
    path: D.ROOT,
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <Navigate replace to={D.HOME} /> },
      { path: relative(D.HOME), element: <OverviewRoute /> },
      { path: relative(D.SECURITY.ROOT), element: <AreaIndex area="security" /> },
      { path: relative(D.SECURITY.VAULT), element: <VaultRoute /> },
      { path: relative(D.SECURITY.USERS), element: <UsersRoute /> },
      { path: relative(D.SECURITY.ROLES), element: <RolesRoute /> },
      { path: relative(D.SECURITY.SESSIONS), element: <SessionsRoute /> },
      { path: relative(D.SECURITY.TOKENS), element: <TokensRoute /> },
      { path: relative(D.SECURITY.AUDIT), element: <AuditRoute /> },
      { path: relative(D.SETTINGS.ROOT), element: <AreaIndex area="settings" /> },
      { path: relative(D.SETTINGS.PLUGINS), element: <PluginsRoute /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <Navigate replace to={D.HOME} /> },
];

/** The router is made once, when the console is first shown. */
export const createConsoleRouter = () => createBrowserRouter(routes);
