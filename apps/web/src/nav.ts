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
  IconLayoutDashboard,
  IconListCheck,
  IconPlayerPlay,
  IconRadar2,
  IconReportAnalytics,
  IconRoute,
  IconServer,
  IconSettings,
  IconShieldLock,
  IconUserShield,
  IconUsers,
  IconWorldWww,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';

import type { Permission } from '@swellwright/contracts';
import type { Namespace } from '@swellwright/i18n';
import type { NavLink, NavSection } from '@swellwright/ui';

/** A page and the permission that opens it. Without one, every signed-in user sees it. */
type GatedLink = NavLink & { permission?: Permission };
type GatedSection = Omit<NavSection, 'links'> & {
  permission?: Permission;
  links?: readonly GatedLink[];
};

/**
 * The navigation planned in docs/en/design/07-ui-ux.md. Pages that are not built yet are shown and disabled,
 * so the structure is visible from the first slice. A page the role cannot open is not shown at all.
 * The labels are in the language of the console, so the list is made for the current `t`.
 */
const navigation = (t: TFunction<Namespace[]>): readonly GatedSection[] => [
  { id: 'overview', label: t('nav:overview'), icon: IconLayoutDashboard },
  {
    id: 'fleet',
    label: t('nav:fleet'),
    icon: IconServer,
    links: [
      {
        id: 'servers',
        label: t('nav:servers'),
        icon: IconServer,
        disabled: true,
        permission: 'servers:read',
      },
      {
        id: 'nodes',
        label: t('nav:nodes'),
        icon: IconHexagon,
        disabled: true,
        permission: 'servers:read',
      },
      {
        id: 'chains',
        label: t('nav:chains'),
        icon: IconCirclesRelation,
        disabled: true,
        permission: 'servers:read',
      },
      {
        id: 'dns',
        label: t('nav:dns'),
        icon: IconWorldWww,
        disabled: true,
        permission: 'servers:read',
      },
      {
        id: 'certificates',
        label: t('nav:certificates'),
        icon: IconCertificate,
        disabled: true,
        permission: 'servers:read',
      },
    ],
  },
  {
    id: 'operations',
    label: t('nav:operations'),
    icon: IconListCheck,
    links: [
      {
        id: 'runs',
        label: t('nav:runs'),
        icon: IconPlayerPlay,
        disabled: true,
        permission: 'runs:read',
      },
      {
        id: 'scenarios',
        label: t('nav:scenarios'),
        icon: IconRoute,
        disabled: true,
        permission: 'runs:read',
      },
      {
        id: 'schedules',
        label: t('nav:schedules'),
        icon: IconCalendarTime,
        disabled: true,
        permission: 'runs:read',
      },
    ],
  },
  {
    id: 'monitoring',
    label: t('nav:monitoring'),
    icon: IconRadar2,
    links: [
      { id: 'probes', label: t('nav:probes'), icon: IconRadar2, disabled: true },
      { id: 'alerts', label: t('nav:alerts'), icon: IconBell, disabled: true },
      { id: 'reports', label: t('nav:reports'), icon: IconReportAnalytics, disabled: true },
    ],
  },
  {
    id: 'panel',
    label: t('nav:panel'),
    icon: IconHexagon,
    links: [
      {
        id: 'profiles',
        label: t('nav:profiles'),
        icon: IconHexagon,
        disabled: true,
        permission: 'panel:read',
      },
      {
        id: 'api-console',
        label: t('nav:apiConsole'),
        icon: IconApi,
        disabled: true,
        permission: 'panel:read',
      },
    ],
  },
  {
    id: 'security',
    label: t('nav:security'),
    icon: IconShieldLock,
    links: [
      { id: 'vault', label: t('nav:vault'), icon: IconKey, permission: 'vault:read' },
      { id: 'users', label: t('nav:users'), icon: IconUsers, permission: 'users:read' },
      { id: 'roles', label: t('nav:roles'), icon: IconUserShield, permission: 'roles:read' },
      { id: 'sessions', label: t('nav:sessions'), icon: IconDevices },
      { id: 'audit', label: t('nav:audit'), icon: IconBook, permission: 'audit:read' },
    ],
  },
  { id: 'settings', label: t('nav:settings'), icon: IconSettings, disabled: true },
];

const pageOf = (link: GatedLink): NavLink => ({
  id: link.id,
  label: link.label,
  icon: link.icon,
  ...(link.disabled ? { disabled: true } : {}),
});

/** The navigation for a user: only what their permissions open. A section left without pages is dropped. */
export function navFor(
  permissions: readonly Permission[],
  t: TFunction<Namespace[]>,
): NavSection[] {
  const allowed = (permission: Permission | undefined): boolean =>
    permission === undefined || permissions.includes(permission);
  const sections: NavSection[] = [];
  for (const { permission, links, ...section } of navigation(t)) {
    if (!allowed(permission)) {
      continue;
    }
    if (!links) {
      sections.push(section);
      continue;
    }
    const visible = links.filter((link) => allowed(link.permission));
    if (visible.length > 0) {
      sections.push({ ...section, links: visible.map(pageOf) });
    }
  }
  return sections;
}
