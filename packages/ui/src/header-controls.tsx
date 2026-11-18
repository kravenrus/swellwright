import { ActionIcon, Group, Loader, Menu, Text } from '@mantine/core';
import { IconBrandGithub, IconLanguage, IconStar, IconUser } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { PiSignOut } from 'react-icons/pi';

import { HeaderControl, SkeletonHeaderControl } from './header-control.js';
import { LogoMark } from './logo.js';

/** The version of the instance: a pill with the mark and the number. Opens the build information. */
export function VersionControl({
  version,
  isLoading,
  isNewVersion,
  isDev,
  label,
  onClick,
}: {
  /** Null while it is not known. */
  version: string | null;
  isLoading: boolean;
  /** A newer release exists: the pill glows. */
  isNewVersion: boolean;
  /** The build does not come from the main branch: the pill turns red. */
  isDev: boolean;
  label: string;
  onClick: () => void;
}) {
  if (isLoading || version === null) {
    return <SkeletonHeaderControl width={85} />;
  }
  return (
    <HeaderControl
      aria-label={label}
      className="sw-hc--version"
      data-dev={isDev || undefined}
      data-new={(isNewVersion && !isDev) || undefined}
      data-wide
      onClick={onClick}
    >
      <Group className="sw-hc-content" gap={8} wrap="nowrap">
        <LogoMark size={20} />
        <Text fw={600} size="sm">
          {version}
        </Text>
      </Group>
    </HeaderControl>
  );
}

/** A link to the project on GitHub, with the gold star and the number of stars when they are known. */
export function GithubControl({
  href,
  stars,
  isLoading = false,
  label,
}: {
  href: string;
  stars?: number | undefined;
  isLoading?: boolean;
  label: string;
}) {
  return (
    <HeaderControl
      aria-label={label}
      component="a"
      data-wide
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <Group className="sw-hc-content" gap={8} wrap="nowrap">
        <IconBrandGithub aria-hidden size={22} />
        {isLoading ? (
          <Group gap={8} wrap="nowrap">
            <IconStar aria-hidden color="gold" size={16} />
            <Loader color="white" size="xs" />
          </Group>
        ) : stars !== undefined && stars > 0 ? (
          <Group gap={4} wrap="nowrap">
            <IconStar aria-hidden color="gold" size={16} />
            <Text fw={600} size="sm">
              {stars}
            </Text>
          </Group>
        ) : null}
      </Group>
    </HeaderControl>
  );
}

export interface LanguageOption {
  value: string;
  /** The name of the language in that language. */
  label: string;
  /** A flag emoji, drawn with the country-flag font where the system has none. */
  emoji: string;
}

/** The language menu: a control that holds a menu, as in the panel. */
export function LanguageControl({
  options,
  value,
  label,
  onChange,
}: {
  options: readonly LanguageOption[];
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <HeaderControl component="div">
      <Menu position="bottom-end" width={150} withinPortal>
        <Menu.Target>
          <ActionIcon
            aria-label={label}
            color="gray"
            size="xl"
            style={{ borderColor: 'transparent' }}
          >
            <IconLanguage aria-hidden size={22} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {options.map((option) => (
            <Menu.Item
              aria-current={option.value === value ? 'true' : undefined}
              key={option.value}
              lang={option.value}
              leftSection={<Text>{option.emoji}</Text>}
              onClick={() => {
                onChange(option.value);
              }}
            >
              {option.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </HeaderControl>
  );
}

/** The account menu. The panel has a single administrator and no such control; here people have accounts. */
export function AccountControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <HeaderControl component="div">
      <Menu position="bottom-end" width={240} withinPortal>
        <Menu.Target>
          <ActionIcon
            aria-label={label}
            color="gray"
            size="xl"
            style={{ borderColor: 'transparent' }}
          >
            <IconUser aria-hidden size={22} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>{children}</Menu.Dropdown>
      </Menu>
    </HeaderControl>
  );
}

/** Sign out: the cyan control at the end of the row. */
export function LogoutControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <HeaderControl aria-label={label} className="sw-hc--accent" onClick={onClick}>
      <PiSignOut aria-hidden style={{ width: 22, height: 22 }} />
    </HeaderControl>
  );
}
