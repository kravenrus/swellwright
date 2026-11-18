import {
  IconApi,
  IconBell,
  IconBook,
  IconCalendarTime,
  IconCertificate,
  IconCirclesRelation,
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

import type { Permission } from '@swellwright/contracts';
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
 */
const NAV: readonly GatedSection[] = [
  { id: 'overview', label: 'Overview', icon: IconLayoutDashboard },
  {
    id: 'fleet',
    label: 'Fleet',
    icon: IconServer,
    links: [
      {
        id: 'servers',
        label: 'Servers',
        icon: IconServer,
        disabled: true,
        permission: 'servers:read',
      },
      {
        id: 'nodes',
        label: 'Nodes',
        icon: IconHexagon,
        disabled: true,
        permission: 'servers:read',
      },
      {
        id: 'chains',
        label: 'Chains',
        icon: IconCirclesRelation,
        disabled: true,
        permission: 'servers:read',
      },
      { id: 'dns', label: 'DNS', icon: IconWorldWww, disabled: true, permission: 'servers:read' },
      {
        id: 'certificates',
        label: 'Certificates',
        icon: IconCertificate,
        disabled: true,
        permission: 'servers:read',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: IconListCheck,
    links: [
      { id: 'runs', label: 'Runs', icon: IconPlayerPlay, disabled: true, permission: 'runs:read' },
      {
        id: 'scenarios',
        label: 'Scenarios',
        icon: IconRoute,
        disabled: true,
        permission: 'runs:read',
      },
      {
        id: 'schedules',
        label: 'Schedules',
        icon: IconCalendarTime,
        disabled: true,
        permission: 'runs:read',
      },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: IconRadar2,
    links: [
      { id: 'probes', label: 'Probes', icon: IconRadar2, disabled: true },
      { id: 'alerts', label: 'Alerts', icon: IconBell, disabled: true },
      { id: 'reports', label: 'Reports', icon: IconReportAnalytics, disabled: true },
    ],
  },
  {
    id: 'panel',
    label: 'Panel',
    icon: IconHexagon,
    links: [
      {
        id: 'profiles',
        label: 'Profiles',
        icon: IconHexagon,
        disabled: true,
        permission: 'panel:read',
      },
      {
        id: 'api-console',
        label: 'API console',
        icon: IconApi,
        disabled: true,
        permission: 'panel:read',
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: IconShieldLock,
    links: [
      { id: 'vault', label: 'Vault', icon: IconKey, permission: 'vault:read' },
      { id: 'users', label: 'Users', icon: IconUsers, permission: 'users:read' },
      { id: 'roles', label: 'Roles', icon: IconUserShield, permission: 'roles:read' },
      { id: 'audit', label: 'Audit', icon: IconBook, permission: 'audit:read' },
    ],
  },
  { id: 'settings', label: 'Settings', icon: IconSettings, disabled: true },
];

const pageOf = (link: GatedLink): NavLink => ({
  id: link.id,
  label: link.label,
  icon: link.icon,
  ...(link.disabled ? { disabled: true } : {}),
});

/** The navigation for a user: only what their permissions open. A section left without pages is dropped. */
export function navFor(permissions: readonly Permission[]): NavSection[] {
  const allowed = (permission: Permission | undefined): boolean =>
    permission === undefined || permissions.includes(permission);
  const sections: NavSection[] = [];
  for (const { permission, links, ...section } of NAV) {
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
