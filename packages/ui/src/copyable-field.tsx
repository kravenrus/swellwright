// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/copyable-field/{copyable-field.tsx,
// copyable-field.module.css}. Changes: the CSS module became `sw-copyable-field*` classes; an optional `onCopy`
// callback; the copy button has an accessible name (props, English fallback); a read-only input needs a name when it
// has no visible label, so `aria-label` is accepted.
import { ActionIcon, CopyButton, Input, type MantineSize } from '@mantine/core';
import type { ReactNode } from 'react';
import { PiCheck, PiCopy } from 'react-icons/pi';

export interface CopyableFieldProps {
  value: number | string;
  label?: ReactNode;
  leftSection?: ReactNode;
  size?: MantineSize;
  /** Accessible name of the input when there is no visible label. */
  'aria-label'?: string;
  /** Called after the value was copied. */
  onCopy?: (value: string) => void;
  /** Accessible name of the copy button, already translated. */
  copyLabel?: string;
  /** Accessible name of the copy button right after a copy, already translated. */
  copiedLabel?: string;
}

/** A read-only, single-line input that copies its value on a click: monospace, with a fade on the right edge. */
export function CopyableField({
  label,
  value,
  leftSection,
  size,
  onCopy,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  'aria-label': ariaLabel,
}: CopyableFieldProps) {
  const text = value.toString();

  return (
    <CopyButton timeout={2000} value={text}>
      {({ copied, copy }) => {
        const doCopy = () => {
          copy();
          onCopy?.(text);
        };
        return (
          <Input.Wrapper {...(label === undefined ? {} : { label })}>
            <div className="sw-copyable-field">
              <Input
                classNames={{
                  input: 'sw-copyable-field-input',
                  section: 'sw-copyable-field-section',
                }}
                leftSectionPointerEvents={leftSection ? 'all' : 'none'}
                onClick={doCopy}
                readOnly
                rightSection={
                  <ActionIcon
                    aria-label={copied ? copiedLabel : copyLabel}
                    className="sw-copyable-field-button"
                    color={copied ? 'teal' : 'gray'}
                    onClick={doCopy}
                    variant="subtle"
                  >
                    {copied ? <PiCheck size="16px" /> : <PiCopy size="16px" />}
                  </ActionIcon>
                }
                value={text}
                {...(leftSection === undefined ? {} : { leftSection })}
                {...(size === undefined ? {} : { size })}
                {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
              />
            </div>
          </Input.Wrapper>
        );
      }}
    </CopyButton>
  );
}
