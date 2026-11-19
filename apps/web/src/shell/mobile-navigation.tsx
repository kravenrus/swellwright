import { Box, Divider, NavLink, Stack, Title } from '@mantine/core';
import { NavLink as RouterLink, useLocation } from 'react-router';

import type { NavSection } from '../nav.js';

/**
 * The navigation of the drawer on a narrow screen, ported from the panel's MobileNavigation: a title with a gradient
 * bar for each group, then one link per page. The panel's groups and ours are the same sections as the tabs.
 */
export function MobileNavigation({
  sections,
  onClose,
}: {
  sections: readonly NavSection[];
  onClose?: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <Stack gap="md" pb="md" pt="md">
      {sections.map((section, index) => (
        <Box key={section.id}>
          {index > 0 ? <Divider color="cyan.4" mb="lg" opacity={0.3} variant="dashed" /> : null}
          <Title className="sw-drawer-section-title" order={6}>
            {section.header}
          </Title>
          <Stack gap={1}>
            {section.items.map((item) => {
              const Icon = item.icon;
              return item.planned === true ? (
                <NavLink
                  className="sw-drawer-link"
                  disabled
                  key={item.id}
                  label={item.name}
                  leftSection={<Icon />}
                  variant="subtle"
                />
              ) : (
                <NavLink
                  active={pathname === item.href}
                  className="sw-drawer-link"
                  component={RouterLink}
                  data-active={pathname === item.href || undefined}
                  key={item.id}
                  label={item.name}
                  leftSection={<Icon />}
                  {...(onClose ? { onClick: onClose } : {})}
                  to={item.href}
                  variant="subtle"
                />
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
