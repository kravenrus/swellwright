import { Alert, Anchor, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconShieldLock } from '@tabler/icons-react';
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

import { ApiRequestError, StepUpCancelledError, stepUp } from '../api.js';
import { CODE_LENGTH, CodeInput } from './code-input.js';
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
    <Modal centered onClose={cancel} opened={opened} title="Confirm it is you" zIndex={400}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text c="dimmed" fz="sm">
            This action needs a fresh code from your authenticator. It stays confirmed for a few
            minutes.
          </Text>
          {recovery ? (
            <TextInput
              autoComplete="off"
              autoFocus
              description="A recovery code looks like ABCD-EFGH-JKLM. It works once."
              label="Recovery code"
              onChange={(e) => {
                setCode(e.currentTarget.value);
              }}
              placeholder="XXXX-XXXX-XXXX"
              value={code}
            />
          ) : (
            <Stack gap={6}>
              <Text fw={500} fz="sm">
                Code from your authenticator
              </Text>
              <CodeInput busy={isPending} onChange={setCode} value={code} />
            </Stack>
          )}
          {mutation.error ? (
            <Alert color="red" icon={<IconAlertCircle size={16} />} role="alert" variant="light">
              {describeError(
                mutation.error,
                recovery
                  ? 'That recovery code is not valid, or was used already.'
                  : 'That code is not right, or was used already. Wait for the next one.',
              )}
            </Alert>
          ) : null}
          <Group justify="space-between">
            <Anchor
              component="button"
              fz="sm"
              onClick={() => {
                setRecovery(!recovery);
                setCode('');
                reset();
              }}
              type="button"
            >
              {recovery ? 'Use the authenticator instead' : 'Use a recovery code'}
            </Anchor>
            <Group>
              <Button onClick={cancel} variant="default">
                Cancel
              </Button>
              <Button leftSection={<IconShieldLock size={16} />} loading={isPending} type="submit">
                Confirm
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
