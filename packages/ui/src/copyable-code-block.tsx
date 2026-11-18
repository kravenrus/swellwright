// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/copyable-code-block/{copyable-code-block.tsx,
// copyable-code-block.module.css}. Changes: the CSS module became `sw-code-block*` classes; an optional `onCopy`
// callback (the panel shows nothing); the copy button has an accessible name (props, English fallback) and the
// whole block can be operated from the keyboard through that button; the optional `multiline` mode keeps line breaks and
// scrolls inside the block (a compose file), which the panel's one-line block does not do.
import {
  ActionIcon,
  Box,
  CopyButton,
  Input,
  type InputWrapperProps,
  type MantineColor,
} from '@mantine/core';
import { PiCheck, PiCopy } from 'react-icons/pi';

import { cx } from './internal.js';

export interface CopyableCodeBlockProps {
  value: number | string;
  /** Text colour of the value. */
  color?: MantineColor;
  /** 'small' is the compact variant for secondary values (a digest, a command). */
  size?: 'normal' | 'small';
  /** Gives the block a label and a description. */
  inputWrapperProps?: InputWrapperProps;
  /** Called after the value was copied. */
  onCopy?: (value: string) => void;
  /** Accessible name of the copy button, already translated. */
  copyLabel?: string;
  /** Accessible name of the button right after a copy, already translated. */
  copiedLabel?: string;
  /**
   * A file rather than a line: keeps line breaks and indentation and scrolls inside the block (a compose fragment, a
   * configuration). The panel's block is one line.
   */
  multiline?: boolean;
  /** With `multiline`: the height at which the block starts to scroll; 360 px by default. */
  maxHeight?: number | string;
  /** With `multiline`: the accessible name of the scrollable region (a keyboard user can scroll it), already translated. */
  regionLabel?: string;
}

/**
 * A block for a secret or a URL: monospace, fading out on the right, and the whole block copies the value on a
 * click. The value cannot be selected; the copy button is the keyboard way in.
 */
export function CopyableCodeBlock({
  color,
  value,
  size = 'normal',
  inputWrapperProps,
  onCopy,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  multiline = false,
  maxHeight = 360,
  regionLabel,
}: CopyableCodeBlockProps) {
  const isSmall = size === 'small';
  const iconSize = isSmall ? 14 : 18;
  const text = value.toString();

  return (
    <Input.Wrapper {...inputWrapperProps}>
      <CopyButton timeout={2000} value={text}>
        {({ copied, copy }) => (
          <Box
            className={cx(
              'sw-code-block',
              isSmall && 'sw-code-block--small',
              multiline && 'sw-code-block--multiline',
            )}
            onClick={() => {
              copy();
              onCopy?.(text);
            }}
          >
            <Box className="sw-code-block-wrapper">
              <Box
                className="sw-code-block-code"
                {...(color === undefined ? {} : { c: color })}
                {...(multiline
                  ? {
                      mah: maxHeight,
                      role: 'region',
                      tabIndex: 0,
                      ...(regionLabel === undefined ? {} : { 'aria-label': regionLabel }),
                    }
                  : {})}
              >
                {value}
              </Box>
            </Box>
            <ActionIcon
              aria-label={copied ? copiedLabel : copyLabel}
              className="sw-code-block-copy"
              data-copied={copied}
              size={isSmall ? 'xs' : 'sm'}
              variant="transparent"
            >
              {copied ? <PiCheck size={iconSize} /> : <PiCopy size={iconSize} />}
            </ActionIcon>
          </Box>
        )}
      </CopyButton>
    </Input.Wrapper>
  );
}
