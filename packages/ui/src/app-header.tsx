import { ActionIcon, Group, Menu } from '@mantine/core';
import { IconChevronDown, type TablerIcon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { Logo } from './logo.js';

export interface NavLink {
  id: string;
  label: string;
  icon: TablerIcon;
  /** A page that is planned but not built yet is shown and disabled. */
  disabled?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  icon: TablerIcon;
  /** A section without links is itself a page. */
  links?: readonly NavLink[];
  disabled?: boolean;
}

export interface AppHeaderProps {
  sections: readonly NavSection[];
  activeId: string;
  onNavigate?: (id: string) => void;
  /** Controls on the right of the brand row. */
  controls?: ReactNode;
  /** The accessible name of the navigation, in the language of the page. */
  navLabel?: string;
}

/** The panel's compact layout: a brand row with controls and a navigation row with grouped sections. */
export function AppHeader({
  sections,
  activeId,
  onNavigate,
  controls,
  navLabel = 'Main',
}: AppHeaderProps) {
  const go = (id: string) => () => {
    onNavigate?.(id);
  };
  return (
    <header className="sw-header">
      <div className="sw-brand-row">
        <Logo />
        <Group gap="xs" wrap="nowrap">
          {controls}
        </Group>
      </div>
      <div className="sw-nav-row">
        <nav aria-label={navLabel} className="sw-nav">
          {sections.map((section) => {
            const Icon = section.icon;
            const active =
              section.id === activeId || (section.links?.some((l) => l.id === activeId) ?? false);
            if (!section.links) {
              return (
                <button
                  className="sw-nav-item"
                  data-active={active || undefined}
                  disabled={section.disabled}
                  key={section.id}
                  onClick={go(section.id)}
                  type="button"
                >
                  <Icon aria-hidden size={18} />
                  {section.label}
                </button>
              );
            }
            return (
              <Menu key={section.id} position="bottom-start" shadow="md" withinPortal>
                <Menu.Target>
                  <button
                    className="sw-nav-item"
                    data-active={active || undefined}
                    disabled={section.disabled}
                    type="button"
                  >
                    <Icon aria-hidden size={18} />
                    {section.label}
                    <IconChevronDown aria-hidden className="sw-caret" size={14} />
                  </button>
                </Menu.Target>
                <Menu.Dropdown>
                  {section.links.map((link) => {
                    const LinkIcon = link.icon;
                    return (
                      <Menu.Item
                        {...(link.disabled ? { disabled: true } : {})}
                        key={link.id}
                        leftSection={<LinkIcon size={16} />}
                        onClick={go(link.id)}
                      >
                        {link.label}
                      </Menu.Item>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function HeaderIconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: TablerIcon;
  onClick?: () => void;
}) {
  return (
    <ActionIcon aria-label={label} color="gray" onClick={onClick} size={36}>
      <Icon size={18} />
    </ActionIcon>
  );
}
