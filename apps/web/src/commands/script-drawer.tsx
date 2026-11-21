// The drawer follows the panel's edit drawers (src/shared/_modals/hosts/edit-host-modal and the template and
// config-profile editors): a 700 px `Drawer` on the right (full screen on a phone) titled with a soft icon and the name,
// grouped `SectionCard`s with the fields, a code editor in the panel's own Monaco setup, and the sticky `DrawerFooter`
// with a teal soft save and a red soft delete. Changes: the fields are those of a script.
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconCode, IconInfoCircle, IconPlayerPlay } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PiFloppyDiskDuotone } from 'react-icons/pi';
import { TbTrash } from 'react-icons/tb';

import {
  type CreateScriptRequest,
  DANGER_LEVELS,
  type DangerLevel,
  MAX_SCRIPT_BODY_BYTES,
  ScriptNameSchema,
  ScriptParametersSchema,
  type ScriptView,
  utf8Length,
} from '@swellwright/contracts';
import {
  Callout,
  CopyableCodeBlock,
  DrawerFooter,
  LoaderModal,
  OverlayHeader,
  SectionCard,
} from '@swellwright/ui';

import { ApiRequestError, createScript, deleteScript, getScript, updateScript } from '../api.js';
import { useStepUp } from '../auth/step-up.js';
import { notifyFailure } from '../security/notify-failure.js';
import { QueryErrorCard } from '../security/query-error.js';
import { useLastDefined } from '../security/use-last-defined.js';
import { confirmAction, notifySuccess } from '../shell/feedback.js';
import { CodeEditor } from './code-editor.js';
import { DANGER_COLOR } from './danger.js';
import {
  definitionOf,
  draftOf,
  ParameterBuilder,
  type ParameterDraft,
} from './parameter-fields.js';

export type ScriptTarget =
  { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'duplicate'; id: string } | undefined;

const FORM_ID = 'script-form';

const STARTER = '#!/bin/sh\n# What this script does, and what it changes.\n\nset -eu\n\n';

interface FormValues {
  name: string;
  description: string;
  dangerLevel: DangerLevel;
  sudo: boolean;
  drafts: ParameterDraft[];
  body: string;
}

const BLANK: FormValues = {
  name: '',
  description: '',
  dangerLevel: 'read',
  sudo: false,
  drafts: [],
  body: STARTER,
};

const valuesOf = (script: ScriptView, copy: boolean, copySuffix: string): FormValues => ({
  name: copy ? `${script.name}${copySuffix}`.slice(0, 64) : script.name,
  description: script.description,
  dangerLevel: script.dangerLevel,
  sudo: script.sudo,
  drafts: script.parameters.map(draftOf),
  body: script.body,
});

/** What is wrong with the form, field by field; nothing when it can be sent. */
function check(values: FormValues) {
  const problems: {
    name?: 'name';
    description?: 'description';
    body?: 'empty' | 'long';
    parameters: { index: number | null; message: string }[];
    parsed?: CreateScriptRequest['parameters'];
  } = { parameters: [] };
  if (!ScriptNameSchema.safeParse(values.name).success) {
    problems.name = 'name';
  }
  if (values.description.trim() === '') {
    problems.description = 'description';
  }
  if (values.body.trim() === '') {
    problems.body = 'empty';
  } else if (utf8Length(values.body) > MAX_SCRIPT_BODY_BYTES) {
    problems.body = 'long';
  }
  const parsed = ScriptParametersSchema.safeParse(values.drafts.map(definitionOf));
  if (parsed.success) {
    problems.parsed = parsed.data;
  } else {
    for (const issue of parsed.error.issues) {
      const [first] = issue.path;
      problems.parameters.push({
        index: typeof first === 'number' ? first : null,
        message: issue.message,
      });
    }
  }
  return problems;
}

function ScriptBody({
  script,
  copy,
  canExec,
  onDone,
  onRun,
}: {
  /** The script being edited, or the one a new script is copied from; absent for a blank one. */
  script: ScriptView | undefined;
  copy: boolean;
  canExec: boolean;
  onDone: () => void;
  onRun: (id: string) => void;
}) {
  const { t } = useTranslation(['commands', 'common']);
  const queryClient = useQueryClient();
  const step = useStepUp();
  const editing = script !== undefined && !copy;
  const readOnly = !canExec || (editing && script.builtin);
  const initial = useMemo(
    () => (script ? valuesOf(script, copy, t('commands:editor.copySuffix')) : BLANK),
    [script, copy, t],
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const problems = check(values);
  const valid =
    problems.name === undefined &&
    problems.description === undefined &&
    problems.body === undefined &&
    problems.parameters.length === 0;
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const patch = (change: Partial<FormValues>) => {
    setValues((previous) => ({ ...previous, ...change }));
  };

  const save = useMutation({
    mutationFn: () => {
      const request: CreateScriptRequest = {
        name: values.name.trim(),
        description: values.description.trim(),
        dangerLevel: values.dangerLevel,
        sudo: values.sudo,
        parameters: problems.parsed ?? [],
        body: values.body,
      };
      return step.run(() => (editing ? updateScript(script.id, request) : createScript(request)));
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['scripts'] });
      queryClient.removeQueries({ queryKey: ['script', saved.id] });
      notifySuccess(
        t('commands:editor.saved'),
        t(editing ? 'commands:editor.savedText' : 'commands:editor.createdText', {
          name: saved.name,
        }),
      );
      onDone();
    },
    onError: (error) => {
      notifyFailure(
        t,
        editing
          ? t('commands:editor.editTitle', { name: script.name })
          : t('commands:editor.createTitle'),
        error,
        t('commands:signInAgain'),
        t('commands:scripts.forbidden'),
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!editing) {
        throw new Error('Nothing to delete.');
      }
      return step.run(() => deleteScript(script.id));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scripts'] });
      notifySuccess(
        t('commands:scripts.deleted'),
        t('commands:scripts.deletedText', { name: script?.name ?? '' }),
      );
      onDone();
    },
    onError: (error) => {
      notifyFailure(
        t,
        t('commands:scripts.deleteTitle', { name: script?.name ?? '' }),
        error,
        t('commands:signInAgain'),
        t('commands:scripts.forbidden'),
      );
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!readOnly && valid) {
      save.mutate();
    }
  };

  const askDelete = () => {
    if (!editing) {
      return;
    }
    confirmAction({
      title: t('commands:scripts.deleteTitle', { name: script.name }),
      message: <Text size="sm">{t('commands:scripts.deleteText')}</Text>,
      confirmLabel: t('common:delete'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        remove.mutate();
      },
    });
  };

  return (
    <>
      <Stack gap="md">
        {script?.builtin && editing ? (
          <Callout color="blue" icon={<IconInfoCircle size={20} />}>
            {t('commands:editor.builtinNotice')}
          </Callout>
        ) : null}
        <form id={FORM_ID} onSubmit={submit}>
          <Stack gap="md">
            <SectionCard.Root>
              <SectionCard.Section>
                <OverlayHeader
                  icon={IconCode}
                  iconColor="teal"
                  iconSize={18}
                  title={t('commands:editor.overview')}
                  titleOrder={5}
                />
              </SectionCard.Section>
              <SectionCard.Section>
                <Stack gap="sm">
                  <TextInput
                    {...(showErrors && problems.name
                      ? { error: t('commands:editor.errors.name') }
                      : {})}
                    data-autofocus={!editing || undefined}
                    description={t('commands:editor.nameDescription')}
                    disabled={readOnly}
                    label={t('commands:editor.name')}
                    maxLength={64}
                    onChange={(event) => {
                      patch({ name: event.currentTarget.value });
                    }}
                    value={values.name}
                    withAsterisk
                  />
                  <Textarea
                    {...(showErrors && problems.description
                      ? { error: t('commands:editor.errors.description') }
                      : {})}
                    autosize
                    disabled={readOnly}
                    label={t('commands:editor.descriptionLabel')}
                    maxLength={500}
                    maxRows={5}
                    minRows={2}
                    onChange={(event) => {
                      patch({ description: event.currentTarget.value });
                    }}
                    value={values.description}
                    withAsterisk
                  />
                  <Stack gap={4}>
                    <Text fw={500} size="sm">
                      {t('commands:editor.level')}
                    </Text>
                    <SegmentedControl
                      color={DANGER_COLOR[values.dangerLevel]}
                      data={DANGER_LEVELS.map((level) => ({
                        value: level,
                        label: t(`commands:danger.${level}`),
                      }))}
                      disabled={readOnly}
                      onChange={(value) => {
                        patch({ dangerLevel: value });
                      }}
                      value={values.dangerLevel}
                    />
                    <Text c="dimmed" size="xs">
                      {t(`commands:dangerHint.${values.dangerLevel}`)}
                    </Text>
                  </Stack>
                  <Switch
                    checked={values.sudo}
                    description={t('commands:editor.sudoDescription')}
                    disabled={readOnly}
                    label={t('commands:editor.sudo')}
                    onChange={(event) => {
                      patch({ sudo: event.currentTarget.checked });
                    }}
                  />
                </Stack>
              </SectionCard.Section>
            </SectionCard.Root>

            <SectionCard.Root>
              <SectionCard.Section>
                <OverlayHeader
                  icon={IconCode}
                  iconColor="cyan"
                  iconSize={18}
                  title={t('commands:editor.parameters')}
                  titleOrder={5}
                />
                <Text c="dimmed" mt={4} size="xs">
                  {t('commands:editor.parametersDescription')}
                </Text>
              </SectionCard.Section>
              <SectionCard.Section>
                <ParameterBuilder
                  disabled={readOnly}
                  drafts={values.drafts}
                  issues={showErrors ? problems.parameters : []}
                  onChange={(drafts) => {
                    patch({ drafts });
                  }}
                />
              </SectionCard.Section>
            </SectionCard.Root>

            <SectionCard.Root>
              <SectionCard.Section>
                <OverlayHeader
                  icon={IconCode}
                  iconColor="violet"
                  iconSize={18}
                  title={t('commands:editor.body')}
                  titleOrder={5}
                />
                <Text c="dimmed" mt={4} size="xs">
                  {t('commands:editor.bodyDescription')}
                </Text>
              </SectionCard.Section>
              <SectionCard.Section>
                <CodeEditor
                  height="420px"
                  label={t('commands:editor.body')}
                  onChange={(body) => {
                    patch({ body });
                  }}
                  readOnly={readOnly}
                  value={values.body}
                />
                {showErrors && problems.body ? (
                  <Text c="red" mt={4} size="xs">
                    {t(`commands:editor.errors.body.${problems.body}`)}
                  </Text>
                ) : null}
              </SectionCard.Section>
            </SectionCard.Root>
          </Stack>
        </form>

        {script && editing ? (
          <SectionCard.Root>
            <SectionCard.Section>
              <Stack gap="xs">
                <Group gap="xs">
                  <Text fw={500} size="sm">
                    {t('commands:editor.version')}
                  </Text>
                  <Text size="sm">{script.version}</Text>
                </Group>
                <CopyableCodeBlock
                  copiedLabel={t('common:copied')}
                  copyLabel={t('common:copy')}
                  inputWrapperProps={{
                    label: t('commands:editor.hash'),
                    description: t('commands:editor.hashDescription'),
                  }}
                  size="small"
                  value={script.bodySha256}
                />
              </Stack>
            </SectionCard.Section>
          </SectionCard.Root>
        ) : null}
      </Stack>
      <DrawerFooter>
        <Group gap="xs" justify="space-between" w="100%">
          <Group gap="xs">
            {readOnly ? null : (
              <Button
                color="teal"
                disabled={editing && !dirty}
                form={FORM_ID}
                leftSection={<PiFloppyDiskDuotone size="16px" />}
                loading={save.isPending}
                size="md"
                type="submit"
                variant="soft"
              >
                {editing ? t('common:save') : t('commands:editor.create')}
              </Button>
            )}
            {canExec && editing ? (
              <Button
                color="cyan"
                disabled={dirty}
                leftSection={<IconPlayerPlay size={16} />}
                onClick={() => {
                  onRun(script.id);
                }}
                size="md"
                variant="soft"
              >
                {t('commands:scripts.run')}
              </Button>
            ) : null}
          </Group>
          {canExec && editing && !script.builtin ? (
            <Tooltip label={t('common:delete')}>
              <ActionIcon
                aria-label={t('common:delete')}
                color="red"
                loading={remove.isPending}
                onClick={askDelete}
                size="xl"
                variant="soft"
              >
                <TbTrash size="24px" />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Group>
      </DrawerFooter>
    </>
  );
}

function Loaded({
  id,
  copy,
  canExec,
  onDone,
  onRun,
}: {
  id: string;
  copy: boolean;
  canExec: boolean;
  onDone: () => void;
  onRun: (id: string) => void;
}) {
  const { t } = useTranslation(['commands', 'common']);
  const query = useQuery({ queryKey: ['script', id], queryFn: () => getScript(id), retry: false });
  if (query.isPending) {
    return <LoaderModal label={t('common:loading')} mih="78vh" />;
  }
  if (query.isError) {
    const gone = query.error instanceof ApiRequestError && query.error.status === 404;
    return (
      <QueryErrorCard
        message={gone ? t('commands:editor.goneText') : t('commands:editor.failedText')}
        onRetry={gone ? onDone : () => void query.refetch()}
        title={gone ? t('commands:editor.goneTitle') : t('commands:editor.failedTitle')}
      />
    );
  }
  return (
    <ScriptBody
      canExec={canExec}
      copy={copy}
      key={`${query.data.id}:${String(query.data.version)}:${String(copy)}`}
      onDone={onDone}
      onRun={onRun}
      script={query.data}
    />
  );
}

/** The drawer of a script: read it, change it (`servers:exec` and a code), copy it, or write a new one. */
export function ScriptDrawer({
  target,
  canExec,
  onChange,
  onRun,
}: {
  target: ScriptTarget;
  canExec: boolean;
  onChange: (target: ScriptTarget) => void;
  onRun: (id: string) => void;
}) {
  const { t } = useTranslation(['commands', 'common']);
  const shown = useLastDefined(target);
  const close = () => {
    onChange(undefined);
  };
  const named = useQuery({
    queryKey: ['script', shown !== undefined && shown.kind !== 'new' ? shown.id : 'none'],
    queryFn: () => getScript(shown !== undefined && shown.kind !== 'new' ? shown.id : ''),
    enabled: shown !== undefined && shown.kind !== 'new',
    retry: false,
  });
  return (
    <Drawer
      closeButtonProps={{ 'aria-label': t('common:close'), ...{ 'data-autofocus': true } }}
      onClose={close}
      opened={target !== undefined}
      padding="lg"
      position="right"
      size="700px"
      title={
        <OverlayHeader
          icon={IconCode}
          iconColor="teal"
          title={
            shown?.kind === 'edit'
              ? (named.data?.name ?? t('commands:editor.title'))
              : t('commands:editor.createTitle')
          }
          truncateTitle
          {...(shown?.kind === 'edit' ? { subtitle: shown.id, withCopy: true } : {})}
        />
      }
    >
      {shown?.kind === 'new' ? (
        <ScriptBody
          canExec={canExec}
          copy={false}
          key="new"
          onDone={close}
          onRun={onRun}
          script={undefined}
        />
      ) : shown ? (
        <Loaded
          canExec={canExec}
          copy={shown.kind === 'duplicate'}
          id={shown.id}
          key={`${shown.kind}:${shown.id}`}
          onDone={close}
          onRun={onRun}
        />
      ) : null}
    </Drawer>
  );
}
