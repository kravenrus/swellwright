// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/entity-card/{index.ts,
// entity-card.root.tsx,entity-card.header.tsx,entity-card.icon.tsx,entity-card.content.tsx,entity-card.actions.tsx,
// entity-card.menu-action.tsx,entity-card.tags.tsx,entity-card.module.css}. Changes: the CSS module became `sw-entity-card*`
// classes; the tag colours come from the same `color-hash` package with the panel's options (lightness 0.65); the menu
// button has an accessible name; the decorative icon is hidden from assistive technology; the optional `wrap` prop lets
// the badges drop under the title at any width (the panel does it only below 48em).
import {
  ActionIcon,
  type ActionIconProps,
  Badge,
  Box,
  Card,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import ColorHash from 'color-hash';
import type { ElementProps } from '@mantine/core';
import type { KeyboardEvent, ReactNode } from 'react';
import { TbDots, TbTag } from 'react-icons/tb';

import { cx } from './internal.js';
import { SingleRowOverflowList } from './single-row-overflow-list.js';

export interface EntityCardRootProps {
  children: ReactNode;
  /** An inactive card has a dark rail instead of a cyan one. */
  isActive?: boolean;
  /** Makes the whole card a button (the panel opens the entity). */
  onClick?: () => void;
  /**
   * For a card with many badges: the badges drop under the title as soon as the row is too narrow for both, at any
   * width. The panel does it only below 48em, because its cards carry little next to the title.
   */
  wrap?: boolean;
  /** Accessible name of the card when it is a button. */
  'aria-label'?: string;
}

function EntityCardRoot({
  children,
  isActive = true,
  onClick,
  wrap = false,
  'aria-label': ariaLabel,
}: EntityCardRootProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    onClick?.();
  };

  return (
    <Card
      className="sw-entity-card"
      data-clickable={onClick ? true : undefined}
      data-layout="row"
      data-wrap={wrap ? true : undefined}
      pb={6}
      pl={12}
      pr={10}
      pt={6}
      {...(onClick === undefined ? {} : { onClick, onKeyDown, role: 'button', tabIndex: 0 })}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
    >
      <Box className={cx('sw-entity-card-rail', !isActive && 'sw-entity-card-rail--inactive')} />
      {children}
    </Card>
  );
}

function EntityCardHeader({ children }: { children: ReactNode }) {
  return (
    <Group align="center" className="sw-entity-card-header" gap={10} wrap="nowrap">
      {children}
    </Group>
  );
}

export type EntityCardIconProps = ActionIconProps &
  ElementProps<'div', keyof ActionIconProps> & {
    /** Teal when true (the default), gray when false. */
    highlight?: boolean;
  };

function EntityCardIcon({ children, highlight = true, className, ...props }: EntityCardIconProps) {
  return (
    <ActionIcon
      aria-hidden
      className={cx('sw-entity-card-icon', className)}
      color={highlight ? 'teal' : 'gray'}
      component="div"
      size={32}
      variant="soft"
      {...props}
    >
      {children}
    </ActionIcon>
  );
}

type MetaProps =
  | { badges: ReactNode; subtitle?: never }
  | { badges?: never; subtitle: ReactNode }
  | { badges?: never; subtitle?: never };

export type EntityCardContentProps = { tags?: string[]; title: string } & MetaProps;

function EntityCardContent({ title, subtitle, badges, tags }: EntityCardContentProps) {
  return (
    <div className="sw-entity-card-content">
      <Text className="sw-entity-card-title" ff="monospace" fw={600} title={title}>
        {title}
      </Text>

      {tags && tags.length > 0 ? (
        <div className="sw-entity-card-tags">
          <EntityCardTags tags={tags} />
        </div>
      ) : null}

      <div className="sw-entity-card-meta">
        {subtitle ? <span className="sw-entity-card-subtitle">{subtitle}</span> : badges}
      </div>
    </div>
  );
}

function EntityCardActions({ children }: { children: ReactNode }) {
  return (
    <Group className="sw-entity-card-actions" gap={0} wrap="nowrap">
      {children}
    </Group>
  );
}

export interface EntityCardMenuProps {
  /** `Menu.Item`s: the positive action teal, the destructive one red and last (the panel puts no divider before it). */
  children: ReactNode;
  /** Accessible name of the dots button, already translated. */
  label?: string;
}

function EntityCardMenu({ children, label = 'Actions' }: EntityCardMenuProps) {
  const [opened, handlers] = useDisclosure();

  return (
    <Menu
      onClose={handlers.close}
      onOpen={handlers.open}
      openDelay={150}
      position="bottom-end"
      radius="md"
      trigger="click-hover"
      withinPortal
    >
      <Menu.Target>
        <ActionIcon
          aria-label={label}
          className="sw-entity-card-menu"
          color={opened ? 'cyan' : 'gray'}
          onClick={(event) => {
            event.stopPropagation();
          }}
          size="30"
          variant={opened ? 'light' : 'subtle'}
        >
          <TbDots size={18} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Stable, readable colour for a tag: the panel's `color-hash` with its lightness of 0.65. */
const colorHash = new ColorHash({ lightness: [0.65, 0.65, 0.65] });

export function tagColor(tag: string): string {
  return colorHash.hex(tag);
}

/** Tags in a single row: the first two, and a "+N" badge whose tooltip lists the rest. */
function EntityCardTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  const sorted = [...tags].sort((a, b) => a.localeCompare(b));

  return (
    <SingleRowOverflowList
      data={sorted}
      gap={0}
      maxVisibleItems={2}
      renderItem={(tag) => (
        <Badge
          autoContrast
          color={tagColor(tag)}
          key={tag}
          leftSection={<TbTag aria-hidden size={12} />}
          px={6}
          size="md"
          variant="transparent"
        >
          {tag}
        </Badge>
      )}
      renderOverflow={(hidden) => (
        <Tooltip
          label={
            <Stack gap={4}>
              {hidden.map((tag) => (
                <Badge
                  color={tagColor(tag)}
                  fullWidth
                  key={tag}
                  leftSection={<TbTag aria-hidden size={12} />}
                  size="md"
                  variant="transparent"
                >
                  {tag}
                </Badge>
              ))}
            </Stack>
          }
          multiline
          position="top"
        >
          <Badge color="gray" px={6} size="md" variant="transparent">
            +{hidden.length}
          </Badge>
        </Tooltip>
      )}
    />
  );
}

/**
 * A list row of the panel: a card with a status rail on its left edge, a soft icon, a monospace title with tags and
 * badges, and a menu. The Plugins, Squads, Templates and Config-profiles pages are lists of these.
 *
 * ```tsx
 * <EntityCard.Root isActive onClick={open}>
 *   <EntityCard.Header>
 *     <EntityCard.Icon highlight><IconPuzzle size={22} /></EntityCard.Icon>
 *     <EntityCard.Content title={name} badges={<StatusBadge kind="ok">Enabled</StatusBadge>} />
 *   </EntityCard.Header>
 *   <EntityCard.Actions><EntityCard.Menu>...</EntityCard.Menu></EntityCard.Actions>
 * </EntityCard.Root>
 * ```
 */
export const EntityCard = {
  Root: EntityCardRoot,
  Header: EntityCardHeader,
  Icon: EntityCardIcon,
  Content: EntityCardContent,
  Actions: EntityCardActions,
  Menu: EntityCardMenu,
  Tags: EntityCardTags,
};
