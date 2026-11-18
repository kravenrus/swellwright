// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/copyable-code-block/{copyable-code-block.tsx,
// copyable-code-block.module.css}. Changes: the CSS module became `sw-code-block*` classes; an optional `onCopy`
// callback (the panel shows nothing); the copy button has an accessible name (props, English fallback) and the
// whole block can be operated from the keyboard through that button; an optional `wrap` shows a long or multi-line
// value in full instead of one fading line.
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
  /**
   * Show the whole value, wrapped (line breaks are kept), instead of one line that fades out on the right. For a
   * value the reader has to see in full: a recovery key, a key file. The text can be selected in this mode.
   */
  wrap?: boolean;
  /** Gives the block a label and a description. */
  inputWrapperProps?: InputWrapperProps;
  /** Called after the value was copied. */
  onCopy?: (value: string) => void;
  /** Accessible name of the copy button, already translated. */
  copyLabel?: string;
  /** Accessible name of the button right after a copy, already translated. */
  copiedLabel?: string;
}

/**
 * A block for a secret or a URL: monospace, fading out on the right, and the whole block copies the value on a
 * click. The value cannot be selected; the copy button is the keyboard way in.
 */
export function CopyableCodeBlock({
  color,
  value,
  size = 'normal',
  wrap = false,
  inputWrapperProps,
  onCopy,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
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
              wrap && 'sw-code-block--wrap',
            )}
            onClick={() => {
              copy();
              onCopy?.(text);
            }}
          >
            <Box className="sw-code-block-wrapper">
              <Box className="sw-code-block-code" {...(color === undefined ? {} : { c: color })}>
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
