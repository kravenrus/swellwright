import { TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export const CODE_LENGTH = 6;

/**
 * One field for the six-digit code. A single input works with password managers and one-time-code
 * autofill (SMS, authenticator suggestions) and keeps its value in plain React state. It is a text input of the
 * sign-in form's size; only the digits are set in monospace and spaced out so six of them are easy to check.
 */
export function CodeInput({
  value,
  onChange,
  busy,
  label,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  /** A request is in flight. The field stays focused (a disabled one would lose focus) but takes no input. */
  busy?: boolean;
  /** A visible label; without one the field is named for assistive technology only. */
  label?: string;
  required?: boolean;
}) {
  const { t } = useTranslation('auth');
  return (
    <TextInput
      autoComplete="one-time-code"
      autoFocus
      inputMode="numeric"
      maxLength={CODE_LENGTH}
      onChange={(e) => {
        onChange(e.currentTarget.value.replace(/\D/gu, '').slice(0, CODE_LENGTH));
      }}
      placeholder="000000"
      readOnly={busy === true}
      styles={{
        input: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          letterSpacing: '0.4em',
          paddingLeft: '0.4em',
          textAlign: 'center',
        },
      }}
      value={value}
      {...(label === undefined ? { 'aria-label': t('totp.codeInputLabel') } : { label })}
      {...(required === true ? { required: true } : {})}
    />
  );
}
