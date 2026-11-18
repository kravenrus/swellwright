// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/loader-modal/loader-model.shared.tsx.
// Changes: named LoaderModal; an optional accessible label for the spinner.
import { Center, Loader, Stack } from '@mantine/core';

import { SectionCard } from './section-card.js';

export interface LoaderModalProps {
  /** Minimum height of the card, for example "200px". */
  mih?: string;
  /** Accessible name of the spinner, already translated. */
  label?: string;
}

/** The loading state inside a modal or a drawer: a card with a large spinner in the middle. */
export function LoaderModal({ mih, label }: LoaderModalProps) {
  return (
    <SectionCard.Root p="xl" {...(mih === undefined ? {} : { mih })}>
      <SectionCard.Section>
        <Center {...(mih === undefined ? {} : { mih })}>
          <Stack align="center" gap="xs">
            <Loader size="64px" {...(label === undefined ? {} : { 'aria-label': label })} />
          </Stack>
        </Center>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}
