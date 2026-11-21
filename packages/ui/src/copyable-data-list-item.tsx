// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/copyable-field/{copyable-data-list-item.tsx,
// copyable-data-list-item.module.css}. Changes: the CSS module became `sw-copyable-item*` classes; the tooltip texts and
// the empty marker are props instead of translation keys; an optional `onCopy` callback.
import { CopyButton, DataList, Tooltip, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { PiCheck, PiCopy } from 'react-icons/pi';

export interface CopyableDataListItemProps {
  label: ReactNode;
  value: null | number | string | undefined;
  /** Set ids, hashes and timestamps in the monospace font. */
  monospace?: boolean;
  /** Shown, dimmed, when there is no value; an em dash by default. */
  emptyValue?: string;
  /** Called after the value was copied. */
  onCopy?: (value: string) => void;
  /** Tooltip before the copy, already translated. */
  copyLabel?: string;
  /** Tooltip after the copy, already translated. */
  copiedLabel?: string;
}

/**
 * One row of a `DataList` whose value copies on a click: a tint on hover, a copy glyph that appears, teal for two
 * seconds after the copy. Use it inside `<DataList withDivider orientation="vertical">` (the passkeys drawer adds `size="xs"`).
 */
export function CopyableDataListItem({
  label,
  value,
  monospace = false,
  emptyValue = '—',
  onCopy,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
}: CopyableDataListItemProps) {
  const isEmpty = value === null || value === undefined || value === '';
  const text = isEmpty ? '' : value.toString();

  return (
    <DataList.Item>
      <DataList.ItemLabel>{label}</DataList.ItemLabel>
      <DataList.ItemValue className="sw-copyable-item-value">
        {isEmpty ? (
          <span className="sw-copyable-item-empty">{emptyValue}</span>
        ) : (
          <CopyButton timeout={2000} value={text}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? copiedLabel : copyLabel} withArrow>
                <UnstyledButton
                  className="sw-copyable-item"
                  data-copied={copied || undefined}
                  data-monospace={monospace || undefined}
                  onClick={() => {
                    copy();
                    onCopy?.(text);
                  }}
                  type="button"
                >
                  <span className="sw-copyable-item-text">{text}</span>
                  <span aria-hidden className="sw-copyable-item-icon">
                    {copied ? <PiCheck size="14px" /> : <PiCopy size="14px" />}
                  </span>
                </UnstyledButton>
              </Tooltip>
            )}
          </CopyButton>
        )}
      </DataList.ItemValue>
    </DataList.Item>
  );
}
