import { Anchor, Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ModalFooter, OverlayHeader } from '@swellwright/ui';

import { ApiRequestError, StepUpCancelledError, stepUp } from '../api.js';
import { CODE_LENGTH, CodeInput } from './code-input.js';
import { FormError } from './form-error.js';
import { describeError } from './messages.js';

interface StepUp {
  /**
   * Runs a call that may need a freshly verified second factor. When the server answers `step_up_required`,
   * asks for a code once and runs the call again; a closed dialog fails it with `StepUpCancelledError`.
   */
  readonly run: <T>(action: () => Promise<T>) => Promise<T>;
}

const StepUpContext = createContext<StepUp | undefined>(undefined);

export function useStepUp(): StepUp {
  const context = useContext(StepUpContext);
  if (!context) {
    throw new Error('useStepUp needs a StepUpProvider above it.');
  }
  return context;
}

interface Waiting {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

/** Holds the confirmation dialog and the helper that every sensitive call goes through. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [waiting, setWaiting] = useState<Waiting | undefined>(undefined);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof ApiRequestError && error.code === 'step_up_required')) {
        throw error;
      }
    }
    await new Promise<void>((resolve, reject) => {
      setWaiting({ resolve, reject });
    });
    return action();
  }, []);
  const value = useMemo<StepUp>(() => ({ run }), [run]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <StepUpDialog
        onCancel={() => {
          waiting?.reject(new StepUpCancelledError());
          setWaiting(undefined);
        }}
        onDone={() => {
          waiting?.resolve();
          setWaiting(undefined);
        }}
        opened={waiting !== undefined}
      />
    </StepUpContext.Provider>
  );
}

function StepUpDialog({
  opened,
  onDone,
  onCancel,
}: {
  opened: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const mutation = useMutation({
    mutationFn: (value: string) => stepUp(value),
    onSuccess: () => {
      setCode('');
      setRecovery(false);
      onDone();
    },
    onError: () => {
      setCode('');
    },
  });
  // Six digits send themselves.
  const { mutate, isPending, reset } = mutation;
  useEffect(() => {
    if (opened && !recovery && code.length === CODE_LENGTH && !isPending) {
      mutate(code);
    }
  }, [opened, code, recovery, isPending, mutate]);

  const cancel = () => {
    reset();
    setCode('');
    setRecovery(false);
    onCancel();
  };
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (code.trim().length > 0) {
      mutate(code);
    }
  };

  return (
    <Modal
      centered
      onClose={cancel}
      opened={opened}
      title={<OverlayHeader icon={IconShieldLock} iconColor="blue" title={t('stepUp.title')} />}
      zIndex={400}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text c="dimmed" fz="sm">
            {t('stepUp.intro')}
          </Text>
          {recovery ? (
            <TextInput
              autoComplete="off"
              autoFocus
              description={t('totp.recoveryHint')}
              label={t('totp.recoveryLabel')}
              onChange={(e) => {
                setCode(e.currentTarget.value);
              }}
              placeholder="XXXX-XXXX-XXXX"
              value={code}
            />
          ) : (
            <Stack gap={6}>
              <Text fw={500} fz="sm">
                {t('totp.codeLabel')}
              </Text>
              <CodeInput busy={isPending} onChange={setCode} value={code} />
            </Stack>
          )}
          <FormError
            message={
              mutation.error
                ? describeError(
                    t,
                    mutation.error,
                    recovery ? t('totp.recoveryInvalid') : t('stepUp.codeWrong'),
                  )
                : undefined
            }
          />
          <Anchor
            c="dimmed"
            component="button"
            fz="xs"
            onClick={() => {
              setRecovery(!recovery);
              setCode('');
              reset();
            }}
            type="button"
          >
            {recovery ? t('totp.useAuthenticator') : t('totp.useRecovery')}
          </Anchor>
        </Stack>
        <ModalFooter>
          <Button onClick={cancel} variant="subtle">
            {t('common:cancel')}
          </Button>
          <Button
            color="teal"
            leftSection={<IconShieldLock size={16} />}
            loading={isPending}
            size="md"
            type="submit"
            variant="soft"
          >
            {t('common:confirm')}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
