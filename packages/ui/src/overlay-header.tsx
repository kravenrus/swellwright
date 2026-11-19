// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/overlays/base-overlay-header/index.tsx.
// Changes: the country flag and the entity-link button are dropped; the icon component prop is called `icon` (the
// panel's `IconComponent`) and the panel's extra `icon` node is called `extra`; `iconVariant` defaults to 'soft';
// copying reports to an optional `onCopy` callback (the panel shows a toast); the copyable title is keyboard reachable.
import {
  Group,
  Stack,
  Text,
  ThemeIcon,
  type ThemeIconProps,
  Title,
  type TitleProps,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import type { ElementType, KeyboardEvent, ReactNode } from 'react';

export interface OverlayHeaderProps {
  /** The icon component (a Tabler or react-icons glyph). */
  icon: ElementType<{ size?: number }>;
  title: string;
  /** A one-line dimmed text under the title. */
  subtitle?: ReactNode;
  /** The colour of the soft icon; it tells the intent (teal save, red danger, orange warning, cyan info). */
  iconColor?: ThemeIconProps['color'];
  /** Defaults to 'soft', the panel's tinted gradient. */
  iconVariant?: ThemeIconProps['variant'];
  /** Defaults to 20; 18 inside small cards. */
  iconSize?: number;
  /** Defaults to 4; the panel uses 5 for the header of a card inside a dialog. */
  titleOrder?: TitleProps['order'];
  hideIcon?: boolean;
  themeIconProps?: ThemeIconProps;
  /** Keep the title on one line and cut it with an ellipsis. */
  truncateTitle?: boolean;
  /** Clicking the title or the subtitle copies it. */
  withCopy?: boolean;
  /** Called after a copy, with the copied text. */
  onCopy?: (value: string) => void;
  /** Anything rendered between the icon and the title. */
  extra?: ReactNode;
}

/**
 * The title of a modal or a drawer, and the header of every card inside one: a soft icon, the title in white and a
 * small dimmed line under it.
 */
export function OverlayHeader({
  icon: Icon,
  title,
  subtitle,
  iconColor = 'cyan',
  iconVariant = 'soft',
  iconSize = 20,
  titleOrder = 4,
  hideIcon = false,
  themeIconProps,
  truncateTitle = false,
  withCopy = false,
  onCopy,
  extra,
}: OverlayHeaderProps) {
  const { copy } = useClipboard();

  const copyText = (text: string) => {
    copy(text);
    onCopy?.(text);
  };
  const onKey = (text: string) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      copyText(text);
    }
  };
  const copyProps = (text: string) =>
    withCopy
      ? {
          role: 'button',
          tabIndex: 0,
          onClick: () => {
            copyText(text);
          },
          onKeyDown: onKey(text),
        }
      : {};

  return (
    <Group gap="sm" style={truncateTitle ? { minWidth: 0 } : undefined} wrap="nowrap">
      {hideIcon ? null : (
        <ThemeIcon
          aria-hidden
          color={iconColor}
          size="lg"
          variant={iconVariant}
          {...themeIconProps}
        >
          <Icon size={iconSize} />
        </ThemeIcon>
      )}

      {extra}

      <Stack gap="0" style={truncateTitle ? { overflow: 'hidden' } : undefined}>
        <Title
          c="white"
          order={titleOrder}
          style={{
            cursor: withCopy ? 'copy' : 'default',
            ...(truncateTitle
              ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              : {}),
          }}
          {...copyProps(title)}
        >
          {title}
        </Title>
        {subtitle ? (
          <Text
            c="dimmed"
            size="xs"
            style={{ cursor: withCopy && typeof subtitle === 'string' ? 'copy' : 'default' }}
            {...(typeof subtitle === 'string' ? copyProps(subtitle) : {})}
          >
            {subtitle}
          </Text>
        ) : null}
      </Stack>
    </Group>
  );
}
