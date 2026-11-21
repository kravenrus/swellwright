import {
  IconApi,
  IconBell,
  IconBook,
  IconCalendarTime,
  IconCertificate,
  IconCirclesRelation,
  IconDevices,
  IconHexagon,
  IconKey,
  IconListCheck,
  IconPackages,
  IconPlayerPlay,
  IconPuzzle,
  IconRadar2,
  IconReportAnalytics,
  IconRoute,
  IconSettings,
  IconShieldLock,
  IconUserShield,
  IconWorldWww,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import type { ElementType } from 'react';
import { HiServer } from 'react-icons/hi';
import { PiUsers } from 'react-icons/pi';
import { TbCookie, TbStar } from 'react-icons/tb';

import type { Permission } from '@swellwright/contracts';
import type { Namespace } from '@swellwright/i18n';

import { ROUTES } from './routes.js';

/** A page of the navigation. A page that is planned but not built yet is shown and disabled. */
export interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: ElementType;
  planned?: boolean;
}

/** A tab of the header: a single page, or a menu of pages (as the sections of the panel's menu). */
export interface NavSection {
  id: string;
  header: string;
  icon: ElementType;
  items: readonly NavItem[];
}

type GatedItem = NavItem & { permission?: Permission };
interface GatedSection extends Omit<NavSection, 'items'> {
  items: readonly GatedItem[];
}

/**
 * The navigation planned in docs/en/design/07-ui-ux.md, in the form of the panel's menu sections: a section with
 * one page is a tab that links to it, a section with several is a tab with a menu. Pages that are not built yet are
 * shown and disabled, so the structure is visible from the first slice. A page the role cannot open is not shown at
 * all. The labels are in the language of the console, so the list is made for the current `t`.
 */
const navigation = (t: TFunction<Namespace[]>): readonly GatedSection[] => [
  {
    id: 'overview',
    header: t('nav:overview'),
    icon: TbStar,
    items: [{ id: 'overview', name: t('nav:overview'), href: ROUTES.DASHBOARD.HOME, icon: TbStar }],
  },
  {
    id: 'fleet',
    header: t('nav:fleet'),
    icon: HiServer,
    items: [
      {
        id: 'servers',
        name: t('nav:servers'),
        href: ROUTES.DASHBOARD.FLEET.SERVERS,
        icon: HiServer,
        permission: 'servers:read',
      },
      {
        id: 'nodes',
        name: t('nav:nodes'),
        href: ROUTES.DASHBOARD.FLEET.NODES,
        icon: IconHexagon,
        planned: true,
        permission: 'servers:read',
      },
      {
        id: 'chains',
        name: t('nav:chains'),
        href: ROUTES.DASHBOARD.FLEET.CHAINS,
        icon: IconCirclesRelation,
        planned: true,
        permission: 'servers:read',
      },
      {
        id: 'dns',
        name: t('nav:dns'),
        href: ROUTES.DASHBOARD.FLEET.DNS,
        icon: IconWorldWww,
        planned: true,
        permission: 'servers:read',
      },
      {
        id: 'certificates',
        name: t('nav:certificates'),
        href: ROUTES.DASHBOARD.FLEET.CERTIFICATES,
        icon: IconCertificate,
        planned: true,
        permission: 'servers:read',
      },
    ],
  },
  {
    id: 'operations',
    header: t('nav:operations'),
    icon: IconListCheck,
    items: [
      {
        id: 'artifacts',
        name: t('nav:artifacts'),
        href: ROUTES.DASHBOARD.OPERATIONS.ARTIFACTS,
        icon: IconPackages,
        permission: 'servers:read',
      },
      {
        id: 'runs',
        name: t('nav:runs'),
        href: ROUTES.DASHBOARD.OPERATIONS.RUNS,
        icon: IconPlayerPlay,
        planned: true,
        permission: 'runs:read',
      },
      {
        id: 'scenarios',
        name: t('nav:scenarios'),
        href: ROUTES.DASHBOARD.OPERATIONS.SCENARIOS,
        icon: IconRoute,
        planned: true,
        permission: 'runs:read',
      },
      {
        id: 'schedules',
        name: t('nav:schedules'),
        href: ROUTES.DASHBOARD.OPERATIONS.SCHEDULES,
        icon: IconCalendarTime,
        planned: true,
        permission: 'runs:read',
      },
    ],
  },
  {
    id: 'monitoring',
    header: t('nav:monitoring'),
    icon: IconRadar2,
    items: [
      {
        id: 'probes',
        name: t('nav:probes'),
        href: ROUTES.DASHBOARD.MONITORING.PROBES,
        icon: IconRadar2,
        planned: true,
      },
      {
        id: 'alerts',
        name: t('nav:alerts'),
        href: ROUTES.DASHBOARD.MONITORING.ALERTS,
        icon: IconBell,
        planned: true,
      },
      {
        id: 'reports',
        name: t('nav:reports'),
        href: ROUTES.DASHBOARD.MONITORING.REPORTS,
        icon: IconReportAnalytics,
        planned: true,
      },
    ],
  },
  {
    id: 'panel',
    header: t('nav:panel'),
    icon: IconHexagon,
    items: [
      {
        id: 'profiles',
        name: t('nav:profiles'),
        href: ROUTES.DASHBOARD.PANEL.PROFILES,
        icon: IconHexagon,
        planned: true,
        permission: 'panel:read',
      },
      {
        id: 'api-console',
        name: t('nav:apiConsole'),
        href: ROUTES.DASHBOARD.PANEL.API_CONSOLE,
        icon: IconApi,
        planned: true,
        permission: 'panel:read',
      },
    ],
  },
  {
    id: 'security',
    header: t('nav:security'),
    icon: IconShieldLock,
    items: [
      {
        id: 'vault',
        name: t('nav:vault'),
        href: ROUTES.DASHBOARD.SECURITY.VAULT,
        icon: IconKey,
        permission: 'vault:read',
      },
      {
        id: 'users',
        name: t('nav:users'),
        href: ROUTES.DASHBOARD.SECURITY.USERS,
        icon: PiUsers,
        permission: 'users:read',
      },
      {
        id: 'roles',
        name: t('nav:roles'),
        href: ROUTES.DASHBOARD.SECURITY.ROLES,
        icon: IconUserShield,
        permission: 'roles:read',
      },
      {
        id: 'sessions',
        name: t('nav:sessions'),
        href: ROUTES.DASHBOARD.SECURITY.SESSIONS,
        icon: IconDevices,
      },
      {
        id: 'tokens',
        name: t('nav:tokens'),
        href: ROUTES.DASHBOARD.SECURITY.TOKENS,
        icon: TbCookie,
      },
      {
        id: 'audit',
        name: t('nav:audit'),
        href: ROUTES.DASHBOARD.SECURITY.AUDIT,
        icon: IconBook,
        permission: 'audit:read',
      },
    ],
  },
  {
    id: 'settings',
    header: t('nav:settings'),
    icon: IconSettings,
    items: [
      {
        id: 'plugins',
        name: t('nav:plugins'),
        href: ROUTES.DASHBOARD.SETTINGS.PLUGINS,
        icon: IconPuzzle,
        permission: 'plugins:read',
      },
    ],
  },
];

/** The navigation for a user: only what their permissions open. A section left without pages is dropped. */
export function navFor(
  permissions: readonly Permission[],
  t: TFunction<Namespace[]>,
): NavSection[] {
  const sections: NavSection[] = [];
  for (const section of navigation(t)) {
    const items = section.items
      .filter((item) => item.permission === undefined || permissions.includes(item.permission))
      .map((item): NavItem => ({
        id: item.id,
        name: item.name,
        href: item.href,
        icon: item.icon,
        ...(item.planned === true ? { planned: true } : {}),
      }));
    if (items.length > 0) {
      sections.push({ ...section, items });
    }
  }
  return sections;
}
