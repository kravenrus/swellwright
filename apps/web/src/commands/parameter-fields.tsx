import {
  ActionIcon,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { TbTrash } from 'react-icons/tb';

import {
  type ParameterIssue,
  type ParameterValues,
  PARAMETER_NAME_PATTERN,
  type ScriptParameter,
  MAX_SCRIPT_PARAMETERS,
  MAX_STRING_PARAMETER_LENGTH,
} from '@swellwright/contracts';
import { SectionCard } from '@swellwright/ui';

/** What a person has typed for the parameters of a script: text, numbers and switches, before it is checked. */
export type ParameterInput = Record<string, string | number | boolean>;

/** The input that starts a form: the defaults of the definitions. */
export function initialInput(parameters: readonly ScriptParameter[]): ParameterInput {
  const input: ParameterInput = {};
  for (const parameter of parameters) {
    if (parameter.default !== undefined) {
      input[parameter.name] = parameter.default;
    }
  }
  return input;
}

/** Fields for the values of a script's parameters, drawn from its definitions with the panel's inputs. */
export function ParameterValueFields({
  parameters,
  input,
  issues,
  onChange,
  disabled = false,
}: {
  parameters: readonly ScriptParameter[];
  input: ParameterInput;
  /** What is wrong with the values, by parameter name; shown under the field. */
  issues: readonly ParameterIssue[];
  onChange: (name: string, value: string | number | boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('commands');
  const errorOf = (name: string): string | undefined =>
    issues.find((issue) => issue.name === name)?.message;
  return (
    <Stack gap="sm">
      {parameters.map((parameter) => {
        const common = {
          label: parameter.label,
          withAsterisk: parameter.required,
          disabled,
          ...(parameter.description === undefined ? {} : { description: parameter.description }),
          ...(errorOf(parameter.name) === undefined ? {} : { error: errorOf(parameter.name) }),
        };
        const current = input[parameter.name];
        switch (parameter.type) {
          case 'string':
            return (
              <TextInput
                {...common}
                key={parameter.name}
                maxLength={parameter.maxLength}
                onChange={(event) => {
                  onChange(parameter.name, event.currentTarget.value);
                }}
                value={typeof current === 'string' ? current : ''}
                {...(parameter.pattern === undefined
                  ? {}
                  : { placeholder: t('parameters.patternHint', { pattern: parameter.pattern }) })}
              />
            );
          case 'integer':
            return (
              <NumberInput
                {...common}
                allowDecimal={false}
                key={parameter.name}
                max={parameter.max}
                min={parameter.min}
                onChange={(value) => {
                  onChange(parameter.name, value);
                }}
                value={typeof current === 'number' || typeof current === 'string' ? current : ''}
              />
            );
          case 'enum':
            return (
              <Select
                {...common}
                allowDeselect={false}
                data={parameter.options}
                key={parameter.name}
                onChange={(value) => {
                  if (value !== null) {
                    onChange(parameter.name, value);
                  }
                }}
                value={typeof current === 'string' ? current : null}
              />
            );
          case 'boolean':
            return (
              <Switch
                checked={current === true}
                disabled={disabled}
                key={parameter.name}
                label={parameter.label}
                onChange={(event) => {
                  onChange(parameter.name, event.currentTarget.checked);
                }}
                {...(parameter.description === undefined
                  ? {}
                  : { description: parameter.description })}
              />
            );
        }
      })}
    </Stack>
  );
}

/** The values to send: what was typed, without the empty ones (the server fills the defaults). */
export function valuesToSend(input: ParameterInput): ParameterValues {
  const values: ParameterValues = {};
  for (const [name, value] of Object.entries(input)) {
    if (value !== '') {
      values[name] = value;
    }
  }
  return values;
}

// ---- the definitions of parameters, in the script editor ----------------------------------------------------------

/** A parameter as the editor holds it: every field as a form control has it, numbers possibly empty. */
export interface ParameterDraft {
  type: ScriptParameter['type'];
  name: string;
  label: string;
  description: string;
  required: boolean;
  pattern: string;
  maxLength: number | string;
  min: number | string;
  max: number | string;
  options: string[];
  defaultText: string;
  defaultNumber: number | string;
  defaultBoolean: boolean;
  hasDefaultBoolean: boolean;
}

export const blankDraft = (): ParameterDraft => ({
  type: 'string',
  name: '',
  label: '',
  description: '',
  required: false,
  pattern: '',
  maxLength: 200,
  min: 0,
  max: 100,
  options: [],
  defaultText: '',
  defaultNumber: '',
  defaultBoolean: false,
  hasDefaultBoolean: false,
});

export function draftOf(parameter: ScriptParameter): ParameterDraft {
  const draft: ParameterDraft = {
    ...blankDraft(),
    type: parameter.type,
    name: parameter.name,
    label: parameter.label,
    description: parameter.description ?? '',
    required: parameter.required,
  };
  switch (parameter.type) {
    case 'string':
      return {
        ...draft,
        pattern: parameter.pattern ?? '',
        maxLength: parameter.maxLength,
        defaultText: parameter.default ?? '',
      };
    case 'integer':
      return {
        ...draft,
        min: parameter.min,
        max: parameter.max,
        defaultNumber: parameter.default ?? '',
      };
    case 'enum':
      return { ...draft, options: [...parameter.options], defaultText: parameter.default ?? '' };
    case 'boolean':
      return {
        ...draft,
        defaultBoolean: parameter.default === true,
        hasDefaultBoolean: parameter.default !== undefined,
      };
  }
}

const num = (value: number | string): number => (typeof value === 'number' ? value : Number(value));

/** The definition the draft stands for, to be checked by the contract's schema (it may not pass). */
export function definitionOf(draft: ParameterDraft): unknown {
  const common = {
    name: draft.name.trim(),
    label: draft.label.trim(),
    required: draft.required,
    ...(draft.description.trim() === '' ? {} : { description: draft.description.trim() }),
  };
  switch (draft.type) {
    case 'string':
      return {
        ...common,
        type: 'string',
        maxLength: num(draft.maxLength),
        ...(draft.pattern === '' ? {} : { pattern: draft.pattern }),
        ...(draft.defaultText === '' ? {} : { default: draft.defaultText }),
      };
    case 'integer':
      return {
        ...common,
        type: 'integer',
        min: num(draft.min),
        max: num(draft.max),
        ...(draft.defaultNumber === '' ? {} : { default: num(draft.defaultNumber) }),
      };
    case 'enum':
      return {
        ...common,
        type: 'enum',
        options: draft.options,
        ...(draft.defaultText === '' ? {} : { default: draft.defaultText }),
      };
    case 'boolean':
      return {
        ...common,
        type: 'boolean',
        ...(draft.hasDefaultBoolean ? { default: draft.defaultBoolean } : {}),
      };
  }
}

const TYPES = ['string', 'integer', 'enum', 'boolean'] as const;

/** The editor of a script's parameter definitions: a card for each, with the fields its type needs. */
export function ParameterBuilder({
  drafts,
  issues,
  onChange,
  disabled = false,
}: {
  drafts: readonly ParameterDraft[];
  /** Problems by position in the list (`null` for the list as a whole). */
  issues: readonly { index: number | null; message: string }[];
  onChange: (drafts: ParameterDraft[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('commands');
  const update = (index: number, patch: Partial<ParameterDraft>) => {
    onChange(drafts.map((draft, at) => (at === index ? { ...draft, ...patch } : draft)));
  };
  const errorOf = (index: number): string | undefined =>
    issues.find((issue) => issue.index === index)?.message;
  const nameInvalid = (name: string): boolean =>
    name.trim() !== '' && !PARAMETER_NAME_PATTERN.test(name.trim());

  return (
    <Stack gap="sm">
      {drafts.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t('parameters.none')}
        </Text>
      ) : null}
      {drafts.map((draft, index) => (
        <SectionCard.Root key={index}>
          <SectionCard.Section>
            <Stack gap="sm">
              <Group align="flex-start" gap="xs" justify="space-between" wrap="nowrap">
                <Group gap="xs">
                  <Badge color="gray" size="lg" variant="soft">
                    {t(`parameters.types.${draft.type}`)}
                  </Badge>
                  {draft.name.trim() === '' ? null : (
                    <Text c="dimmed" ff="monospace" size="xs">
                      {`SW_PARAM_${draft.name.trim().toUpperCase()}`}
                    </Text>
                  )}
                </Group>
                {disabled ? null : (
                  <Tooltip label={t('parameters.remove')}>
                    <ActionIcon
                      aria-label={t('parameters.remove')}
                      color="red"
                      onClick={() => {
                        onChange(drafts.filter((_, at) => at !== index));
                      }}
                      size="lg"
                      variant="soft"
                    >
                      <TbTrash size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
              <Group align="flex-start" grow>
                <TextInput
                  {...(nameInvalid(draft.name) || errorOf(index) !== undefined
                    ? { error: nameInvalid(draft.name) ? t('parameters.nameHint') : errorOf(index) }
                    : {})}
                  description={t('parameters.nameDescription')}
                  disabled={disabled}
                  label={t('parameters.name')}
                  onChange={(event) => {
                    update(index, { name: event.currentTarget.value });
                  }}
                  value={draft.name}
                  withAsterisk
                />
                <TextInput
                  disabled={disabled}
                  label={t('parameters.label')}
                  maxLength={80}
                  onChange={(event) => {
                    update(index, { label: event.currentTarget.value });
                  }}
                  value={draft.label}
                  withAsterisk
                />
              </Group>
              <Group align="flex-start" grow>
                <Select
                  allowDeselect={false}
                  data={TYPES.map((type) => ({
                    value: type,
                    label: t(`parameters.types.${type}`),
                  }))}
                  disabled={disabled}
                  label={t('parameters.type')}
                  onChange={(value) => {
                    if (value !== null) {
                      update(index, { type: value });
                    }
                  }}
                  value={draft.type}
                />
                <Switch
                  checked={draft.required}
                  disabled={disabled}
                  label={t('parameters.required')}
                  mt={28}
                  onChange={(event) => {
                    update(index, { required: event.currentTarget.checked });
                  }}
                />
              </Group>
              <TextInput
                disabled={disabled}
                label={t('parameters.description')}
                maxLength={300}
                onChange={(event) => {
                  update(index, { description: event.currentTarget.value });
                }}
                value={draft.description}
              />
              {draft.type === 'string' ? (
                <Stack gap="sm">
                  <TextInput
                    description={t('parameters.patternDescription')}
                    disabled={disabled}
                    ff="monospace"
                    label={t('parameters.pattern')}
                    maxLength={200}
                    onChange={(event) => {
                      update(index, { pattern: event.currentTarget.value });
                    }}
                    value={draft.pattern}
                  />
                  <Group align="flex-start" grow>
                    <NumberInput
                      allowDecimal={false}
                      disabled={disabled}
                      label={t('parameters.maxLength')}
                      max={MAX_STRING_PARAMETER_LENGTH}
                      min={1}
                      onChange={(value) => {
                        update(index, { maxLength: value });
                      }}
                      value={draft.maxLength}
                    />
                    <TextInput
                      disabled={disabled}
                      label={t('parameters.default')}
                      onChange={(event) => {
                        update(index, { defaultText: event.currentTarget.value });
                      }}
                      value={draft.defaultText}
                    />
                  </Group>
                </Stack>
              ) : null}
              {draft.type === 'integer' ? (
                <Group align="flex-start" grow>
                  <NumberInput
                    allowDecimal={false}
                    disabled={disabled}
                    label={t('parameters.min')}
                    onChange={(value) => {
                      update(index, { min: value });
                    }}
                    value={draft.min}
                  />
                  <NumberInput
                    allowDecimal={false}
                    disabled={disabled}
                    label={t('parameters.max')}
                    onChange={(value) => {
                      update(index, { max: value });
                    }}
                    value={draft.max}
                  />
                  <NumberInput
                    allowDecimal={false}
                    disabled={disabled}
                    label={t('parameters.default')}
                    onChange={(value) => {
                      update(index, { defaultNumber: value });
                    }}
                    value={draft.defaultNumber}
                  />
                </Group>
              ) : null}
              {draft.type === 'enum' ? (
                <Group align="flex-start" grow>
                  <TagsInput
                    description={t('parameters.optionsDescription')}
                    disabled={disabled}
                    label={t('parameters.options')}
                    onChange={(options) => {
                      update(index, { options });
                    }}
                    value={draft.options}
                  />
                  <Select
                    clearable
                    data={draft.options}
                    disabled={disabled}
                    label={t('parameters.default')}
                    onChange={(value) => {
                      update(index, { defaultText: value ?? '' });
                    }}
                    value={draft.defaultText === '' ? null : draft.defaultText}
                  />
                </Group>
              ) : null}
              {draft.type === 'boolean' ? (
                <Group gap="lg">
                  <Switch
                    checked={draft.hasDefaultBoolean}
                    disabled={disabled}
                    label={t('parameters.hasDefault')}
                    onChange={(event) => {
                      update(index, { hasDefaultBoolean: event.currentTarget.checked });
                    }}
                  />
                  <Switch
                    checked={draft.defaultBoolean}
                    disabled={disabled || !draft.hasDefaultBoolean}
                    label={t('parameters.defaultOn')}
                    onChange={(event) => {
                      update(index, { defaultBoolean: event.currentTarget.checked });
                    }}
                  />
                </Group>
              ) : null}
              {errorOf(index) !== undefined && !nameInvalid(draft.name) ? (
                <Text c="red" size="sm">
                  {errorOf(index)}
                </Text>
              ) : null}
            </Stack>
          </SectionCard.Section>
        </SectionCard.Root>
      ))}
      {issues
        .filter((issue) => issue.index === null)
        .map((issue) => (
          <Text c="red" key={issue.message} size="sm">
            {issue.message}
          </Text>
        ))}
      {disabled || drafts.length >= MAX_SCRIPT_PARAMETERS ? null : (
        <Group>
          <Button
            color="teal"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              onChange([...drafts, blankDraft()]);
            }}
            variant="soft"
          >
            {t('parameters.add')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
