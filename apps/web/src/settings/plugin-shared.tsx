import { Button, DataList, Stack } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorMessageBlock, OverlayHeader, SectionCard } from '@swellwright/ui';

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

/** The rows of a details card: label above the value, a divider between rows, as the panel's detail drawers. */
export function DetailList({ children }: { children: ReactNode }) {
  return (
    <DataList orientation="vertical" size="xs" withDivider>
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
 * A card that says something could not be loaded: a red header, the reason in the panel's copyable error block and,
 * when there is something to try again, a retry button.
 */
export function FailureCard({
  title,
  message,
  onRetry,
  retrying = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation('common');
  const labels = useCopyLabels();
  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader icon={IconAlertTriangle} iconColor="red" title={title} titleOrder={5} />
      </SectionCard.Section>
      <SectionCard.Section>
        <Stack gap="sm">
          <ErrorMessageBlock message={message} {...labels} />
          {onRetry ? (
            <Button
              leftSection={<IconRefresh size={16} />}
              loading={retrying}
              onClick={onRetry}
              size="sm"
              variant="soft"
            >
              {t('retry')}
            </Button>
          ) : null}
        </Stack>
      </SectionCard.Section>
    </SectionCard.Root>
  );
}
