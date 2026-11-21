import { AppShell, Box, Burger, Container, Divider, Group, ScrollArea } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { Suspense, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, ScrollRestoration } from 'react-router';

import { Brand, LoadingScreen } from '@swellwright/ui';

import { navFor } from '../nav.js';
import { ROUTES } from '../routes.js';
import { useConsole } from './console-context.js';
import { DesktopNavigation } from './desktop-navigation.js';
import { DocsLink, GithubLink, HeaderControls } from './header-controls.js';
import { MobileNavigation } from './mobile-navigation.js';
import { useIsHiResDesktop, useIsMobile } from './use-is-mobile.js';

/** The brand as a link home. */
function BrandLink() {
  return (
    <Link aria-label="Swellwright" className="sw-brand-link" to={ROUTES.DASHBOARD.HOME}>
      <Brand />
    </Link>
  );
}

/** The routed page: lazy pages show the panel's loading bar while they load. */
function Content() {
  const { t } = useTranslation('common');
  return (
    <Suspense fallback={<LoadingScreen height="60vh" text={t('loading')} />}>
      <Outlet />
    </Suspense>
  );
}

function CompactLayout({ navigation }: { navigation: ReactNode }) {
  const hiRes = useIsHiResDesktop();
  return (
    <AppShell
      className="sw-shell"
      header={{ height: hiRes ? 64 : 116, offset: false }}
      padding="xl"
    >
      <AppShell.Header className="sw-header">
        <div className="sw-brand-row">
          <Group align="stretch" gap="xs" h="100%" style={{ minWidth: 0 }} wrap="nowrap">
            <BrandLink />
            {hiRes ? (
              <>
                <Divider
                  h="50%"
                  orientation="vertical"
                  style={{ alignSelf: 'center', marginLeft: '10px', marginRight: '10px' }}
                />
                {navigation}
              </>
            ) : null}
          </Group>
          <Group gap="xs" style={{ flexShrink: 0 }} wrap="nowrap">
            <HeaderControls />
          </Group>
        </div>
        {hiRes ? null : <div className="sw-nav-row">{navigation}</div>}
      </AppShell.Header>

      <AppShell.Main
        {...(hiRes ? { pl: '10vw', pr: '10vw' } : {})}
        pt="calc(var(--app-shell-header-height) + var(--mantine-spacing-md))"
      >
        <Content />
        <ScrollRestoration />
      </AppShell.Main>
    </AppShell>
  );
}

function MobileLayout({ sections }: { sections: ReturnType<typeof navFor> }) {
  const { t } = useTranslation('shell');
  const [opened, { toggle }] = useDisclosure();
  const ref = useClickOutside(() => {
    if (opened) {
      toggle();
    }
  });
  return (
    <AppShell
      header={{ height: 64, collapsed: false, offset: false }}
      layout="alt"
      navbar={{ width: 300, breakpoint: 'lg', collapsed: { mobile: !opened, desktop: true } }}
      padding="md"
      transitionDuration={500}
      transitionTimingFunction="ease-in-out"
    >
      <AppShell.Header className="sw-header sw-header-mobile" withBorder={false}>
        <Container fluid px="lg" py="xs">
          <Group justify="space-between" style={{ flexWrap: 'nowrap' }}>
            <Group style={{ flex: 1, justifyContent: 'flex-start' }}>
              <Burger
                aria-expanded={opened}
                aria-label={opened ? t('closeMenu') : t('openMenu')}
                onClick={toggle}
                opened={opened}
                size="md"
              />
            </Group>
            <Group style={{ flexShrink: 0 }}>
              <HeaderControls mobile />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Navbar
        className={opened ? 'sw-drawer' : 'sw-drawer sw-drawer-closed'}
        p="md"
        pb={0}
        ref={ref}
        w={300}
        withBorder={false}
      >
        <AppShell.Section className="sw-drawer-logo">
          <Box style={{ position: 'absolute', left: '0' }}>
            <Burger
              aria-label={t('closeMenu')}
              hiddenFrom="lg"
              onClick={toggle}
              opened={opened}
              size="sm"
            />
          </Box>
          <Group gap="xs" justify="center" wrap="nowrap">
            <BrandLink />
          </Group>
        </AppShell.Section>
        <AppShell.Section
          className="sw-drawer-scroll"
          component={ScrollArea}
          flex={1}
          scrollbarSize="0.2rem"
        >
          <MobileNavigation onClose={toggle} sections={sections} />
        </AppShell.Section>
        <AppShell.Section className="sw-drawer-footer">
          <Group justify="center" mt="md" style={{ flexShrink: 0 }}>
            <DocsLink />
            <GithubLink />
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main
        pb="var(--mantine-spacing-md)"
        pt="calc(var(--app-shell-header-height) + 10px)"
      >
        <Content />
        <ScrollRestoration />
      </AppShell.Main>
    </AppShell>
  );
}

/** The frame of every page after sign-in: the panel's header and navigation, or its drawer on a narrow screen. */
export function ConsoleLayout() {
  const { t } = useTranslation(['common', 'nav']);
  const { session } = useConsole();
  const isMobile = useIsMobile();
  const { permissions } = session;
  const sections = useMemo(() => navFor(permissions, t), [permissions, t]);

  if (isMobile) {
    return <MobileLayout sections={sections} />;
  }
  return (
    <CompactLayout
      navigation={<DesktopNavigation label={t('common:mainNavigation')} sections={sections} />}
    />
  );
}
