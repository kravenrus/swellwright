import { TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export const CODE_LENGTH = 6;

/**
 * One field for the six-digit code. A single input works with password managers and one-time-code
 * autofill (SMS, authenticator suggestions) and keeps its value in plain React state.
 */
export function CodeInput({
  value,
  onChange,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  /** A request is in flight. The field stays focused (a disabled one would lose focus) but takes no input. */
  busy?: boolean;
}) {
  const { t } = useTranslation('auth');
  return (
    <TextInput
      aria-label={t('totp.codeInputLabel')}
      autoComplete="one-time-code"
      autoFocus
      inputMode="numeric"
      maxLength={CODE_LENGTH}
      onChange={(e) => {
        onChange(e.currentTarget.value.replace(/\D/gu, '').slice(0, CODE_LENGTH));
      }}
      placeholder="000000"
      readOnly={busy === true}
      size="lg"
      styles={{
        input: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          letterSpacing: '0.6em',
          paddingLeft: '0.6em',
          textAlign: 'center',
        },
      }}
      value={value}
    />
  );
}
