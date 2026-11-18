// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/tag-filter-bar/tag-filter-bar.tsx.
// Changes: the "All" and "Untagged" labels are props instead of translation keys; `tagLabel` lets the tags be keys with
// translated labels; the active tab reports `aria-pressed`.
import { Badge, Button, Group, Scroller } from '@mantine/core';
import { type ReactNode, useEffect, useMemo } from 'react';
import { TbStack2, TbTag, TbTagOff } from 'react-icons/tb';

/** The value of `activeTag` when the "untagged" tab is chosen. */
export const NO_TAG = '__no_tag__';

interface Taggable {
  tags?: null | string[];
}

export interface TagFilterBarProps {
  /** The chosen tag; `null` is "All", `NO_TAG` is "Untagged". */
  activeTag: null | string;
  /** The items to filter; each one carries `tags`. The tabs and their counts are computed from them. */
  items: readonly Taggable[] | undefined;
  onChange: (tag: null | string) => void;
  /** Label of the first tab, already translated. */
  allLabel: string;
  /** Label of the tab for items without tags, already translated. */
  untaggedLabel: string;
  /** Turns a tag into the label shown on its tab; the tag itself by default. */
  tagLabel?: (tag: string) => string;
}

interface FilterTabProps {
  count: number;
  icon: ReactNode;
  isActive: boolean;
  label: string;
  onClick: () => void;
}

function FilterTab({ count, icon, isActive, label, onClick }: FilterTabProps) {
  return (
    <Button
      aria-pressed={isActive}
      color={isActive ? 'cyan' : 'gray'}
      leftSection={icon}
      onClick={onClick}
      rightSection={
        <Badge
          color={isActive ? 'cyan' : 'gray'}
          radius="sm"
          size="sm"
          variant={isActive ? 'soft' : 'light'}
        >
          {count}
        </Badge>
      }
      size="sm"
      style={{ flexShrink: 0 }}
      variant={isActive ? 'soft' : 'subtle'}
    >
      {label}
    </Button>
  );
}

/**
 * A scrollable strip of filter tabs above a list: All, one tab per tag with its count, and Untagged. It renders
 * nothing while no item has a tag, and resets the filter when the chosen tag disappears.
 */
export function TagFilterBar({
  activeTag,
  items,
  onChange,
  allLabel,
  untaggedLabel,
  tagLabel = (tag) => tag,
}: TagFilterBarProps) {
  const { tags, tagCounts, untaggedCount } = useMemo(() => {
    const countMap = new Map<string, number>();
    let untagged = 0;

    for (const item of items ?? []) {
      const itemTags = item.tags ?? [];
      if (itemTags.length === 0) {
        untagged += 1;
        continue;
      }
      for (const tag of itemTags) countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
    }

    return {
      tags: [...countMap.keys()].sort((a, b) => a.localeCompare(b)),
      tagCounts: countMap,
      untaggedCount: untagged,
    };
  }, [items]);

  useEffect(() => {
    if (activeTag === null) return;
    const isStale = activeTag === NO_TAG ? untaggedCount === 0 : !tagCounts.has(activeTag);
    if (isStale) {
      onChange(null);
    }
  }, [activeTag, tagCounts, untaggedCount, onChange]);

  if (tags.length === 0) {
    return null;
  }

  return (
    <Scroller bdrs="md" className="sw-tag-filter-bar" draggable mb="xs">
      <Group gap="xs" p="xs" wrap="nowrap">
        <FilterTab
          count={items?.length ?? 0}
          icon={<TbStack2 size={16} />}
          isActive={activeTag === null}
          label={allLabel}
          onClick={() => {
            onChange(null);
          }}
        />

        {tags.map((tag) => (
          <FilterTab
            count={tagCounts.get(tag) ?? 0}
            icon={<TbTag size={16} />}
            isActive={activeTag === tag}
            key={tag}
            label={tagLabel(tag)}
            onClick={() => {
              onChange(tag);
            }}
          />
        ))}

        {untaggedCount > 0 ? (
          <FilterTab
            count={untaggedCount}
            icon={<TbTagOff size={16} />}
            isActive={activeTag === NO_TAG}
            label={untaggedLabel}
            onClick={() => {
              onChange(NO_TAG);
            }}
          />
        ) : null}
      </Group>
    </Scroller>
  );
}

/** Keeps the items that match the chosen tab: all, one tag, or the untagged ones. */
export function filterByTag<T extends Taggable>(items: T[], activeTag: null | string): T[] {
  if (activeTag === null) return items;
  if (activeTag === NO_TAG) return items.filter((item) => (item.tags ?? []).length === 0);

  return items.filter((item) => (item.tags ?? []).includes(activeTag));
}
