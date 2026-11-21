// `FailureCard` is adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/_modals/nodes/
// node-active-sessions-drawer/failed-state.widget.tsx. Changes: a title above the reason, the reason is the translated
// error of the call, the height is a prop, and the card announces itself as an alert.
import { Button, Center, DataList, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@swellwright/ui';

import { StepUpCancelledError } from '../api.js';
import { describeError } from '../auth/messages.js';
import { notifyError, notifyWarning } from '../shell/feedback.js';

/** The translated texts of the copy controls of the shared blocks (tooltips and accessible names). */
export function useCopyLabels(): { copyLabel: string; copiedLabel: string } {
  const { t } = useTranslation('common');
  return { copyLabel: t('copy'), copiedLabel: t('copied') };
}

/**
 * What a failed call says, as a toast. `whenForbidden` is what a refusal for lack of permission reads on this screen,
 * already translated. A step-up the person walked away from is a warning (nothing broke), anything else is an error.
 */
export function usePluginFailure(): (title: string, error: unknown, whenForbidden: string) => void {
  const { t } = useTranslation(['plugins', 'errors']);
  return (title, error, whenForbidden) => {
    const message = describeError(t, error, t('signInAgain'), whenForbidden);
    if (error instanceof StepUpCancelledError) {
      notifyWarning(title, message);
    } else {
      notifyError(title, message);
    }
  };
}

/**
 * The rows of a details card: label above the value, a divider between rows. The panel's detailed-user drawer
 * (`detailed-user-info.drawer.tsx`) sets exactly `withDivider orientation="vertical"` and no size, so the rows are
 * Mantine's default 14 px.
 */
export function DetailList({ children }: { children: ReactNode }) {
  return (
    <DataList orientation="vertical" withDivider>
      {children}
    </DataList>
  );
}

/** One row of a `DetailList` whose value is not plain copyable text (badges, lists). */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <DataList.Item>
      <DataList.ItemLabel>{label}</DataList.ItemLabel>
      <DataList.ItemValue>{children}</DataList.ItemValue>
    </DataList.Item>
  );
}

/**
 * A card that says something could not be loaded, drawn as the panel draws a failed load
 * (`node-active-sessions-drawer/failed-state.widget.tsx`): a `SectionCard` with a centred red soft icon, the reason in
 * dimmed text and a teal soft "try again" button. The title is ours (the panel has one generic sentence).
 */
export function FailureCard({
  title,
  message,
  onRetry,
  retrying = false,
  height = 230,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Minimum height of the centred area; 230 in the panel. */
  height?: number;
}) {
  const { t } = useTranslation('common');
  return (
    <SectionCard.Root gap="sm">
      <SectionCard.Section>
        <Center mih={height} role="alert">
          <Stack align="center" gap="xs" maw={480}>
            <ThemeIcon aria-hidden color="red" radius="md" size="xl" variant="soft">
              <IconAlertTriangle size={24} />
            </ThemeIcon>
            <Text c="white" fw={600} size="md" ta="center">
              {title}
            </Text>
            <Text c="dimmed" size="md" ta="center">
              {message}
            </Text>
            {onRetry ? (
              <Button
                color="teal"
                leftSection={<IconRefresh size={20} />}
                loading={retrying}
                onClick={onRetry}
                size="sm"
                variant="soft"
              >
                {t('retry')}
              </Button>
            ) : null}
          </Stack>
        </Center>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}
