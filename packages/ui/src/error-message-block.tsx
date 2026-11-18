// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/error-message-block/{error-message-block.tsx,
// ErrorMessageBlock.module.css}. Changes: the CSS module became `sw-error-block*` classes; the tooltip and button texts
// are props (English fallback) instead of translation keys; an optional `onCopy` callback.
import { ActionIcon, Box, CopyButton, Text, Tooltip } from '@mantine/core';
import { PiCheck, PiCopy } from 'react-icons/pi';

export interface ErrorMessageBlockProps {
  message: string;
  /** Called after the message was copied. */
  onCopy?: (value: string) => void;
  /** Tooltip and accessible name of the copy button, already translated. */
  copyLabel?: string;
  /** Accessible name right after the copy, already translated. */
  copiedLabel?: string;
}

/**
 * The text of a technical error in a dark box with a red left edge, monospace, scrollable, with a copy button. For
 * errors worth copying (a node's last error, a plugin problem); a toast is for "the action failed".
 */
export function ErrorMessageBlock({
  message,
  onCopy,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
}: ErrorMessageBlockProps) {
  return (
    <Box className="sw-error-block">
      <Text className="sw-error-block-text">{message}</Text>

      <CopyButton timeout={2000} value={message}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? copiedLabel : copyLabel}>
            <ActionIcon
              aria-label={copied ? copiedLabel : copyLabel}
              className="sw-error-block-copy"
              color={copied ? 'teal' : 'gray'}
              data-copied={copied}
              onClick={() => {
                copy();
                onCopy?.(message);
              }}
              size="sm"
              variant="subtle"
            >
              {copied ? <PiCheck size={14} /> : <PiCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Box>
  );
}
