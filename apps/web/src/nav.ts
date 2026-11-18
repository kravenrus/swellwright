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
  IconWorldWww,
} from '@tabler/icons-react';

import type { NavSection } from '@swellwright/ui';

/**
 * The navigation planned in docs/en/design/07-ui-ux.md. Pages that are not built yet are shown and disabled,
 * so the structure is visible from the first slice.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  { id: 'overview', label: 'Overview', icon: IconLayoutDashboard },
  {
    id: 'fleet',
    label: 'Fleet',
    icon: IconServer,
    links: [
      { id: 'servers', label: 'Servers', icon: IconServer, disabled: true },
      { id: 'nodes', label: 'Nodes', icon: IconHexagon, disabled: true },
      { id: 'chains', label: 'Chains', icon: IconCirclesRelation, disabled: true },
      { id: 'dns', label: 'DNS', icon: IconWorldWww, disabled: true },
      { id: 'certificates', label: 'Certificates', icon: IconCertificate, disabled: true },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: IconListCheck,
    links: [
      { id: 'runs', label: 'Runs', icon: IconPlayerPlay, disabled: true },
      { id: 'scenarios', label: 'Scenarios', icon: IconRoute, disabled: true },
      { id: 'schedules', label: 'Schedules', icon: IconCalendarTime, disabled: true },
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
      { id: 'profiles', label: 'Profiles', icon: IconHexagon, disabled: true },
      { id: 'api-console', label: 'API console', icon: IconApi, disabled: true },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: IconShieldLock,
    links: [
      { id: 'vault', label: 'Vault', icon: IconKey, disabled: true },
      { id: 'audit', label: 'Audit', icon: IconBook, disabled: true },
    ],
  },
  { id: 'settings', label: 'Settings', icon: IconSettings, disabled: true },
];
