// The output block follows the panel's code blocks (the `CodeHighlight` of its error page and the `CopyableCodeBlock`):
// a monospace block on the card colour with a copy button at the top right. Changes: it scrolls inside a fixed height and
// stays at the end while the text grows, as a log does, until the reader scrolls up.
import { ActionIcon, Box, Code, CopyButton, ScrollArea, Text, Tooltip } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PiCheck, PiCopy } from 'react-icons/pi';

/** A stream of a script: its text, with a copy button, following the end while the script writes. */
export function OutputView({
  text,
  label,
  follow,
  maxHeight = 320,
}: {
  text: string;
  /** What the block is (its accessible name): `stdout of server-1`. */
  label: string;
  /** Keep the end in view as the text grows (the script is still running). */
  follow: boolean;
  maxHeight?: number;
}) {
  const { t } = useTranslation('common');
  const viewport = useRef<HTMLDivElement>(null);
  // Whether the reader is at the end: only then does a new line pull the view down.
  const atEnd = useRef(true);

  useEffect(() => {
    const element = viewport.current;
    if (follow && element && atEnd.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [text, follow]);

  return (
    <Box pos="relative">
      <ScrollArea.Autosize
        aria-label={label}
        mah={maxHeight}
        onScrollPositionChange={({ y }) => {
          const element = viewport.current;
          if (element) {
            atEnd.current = element.scrollHeight - element.clientHeight - y < 24;
          }
        }}
        role="region"
        scrollbars="xy"
        tabIndex={0}
        type="auto"
        viewportRef={viewport}
      >
        <Code
          block
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            fontSize: 'var(--mantine-font-size-xs)',
            minHeight: 36,
            paddingRight: 44,
            whiteSpace: 'pre',
          }}
        >
          {text === '' ? (
            <Text c="dimmed" component="span" fz="xs">
              –
            </Text>
          ) : (
            text
          )}
        </Code>
      </ScrollArea.Autosize>
      <CopyButton timeout={1500} value={text}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? t('copied') : t('copy')}>
            <ActionIcon
              aria-label={copied ? t('copied') : t('copy')}
              color={copied ? 'teal' : 'gray'}
              disabled={text === ''}
              onClick={copy}
              pos="absolute"
              right={8}
              size="md"
              top={6}
              variant="subtle"
            >
              {copied ? <PiCheck size={16} /> : <PiCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Box>
  );
}
