import { Text } from '@mantine/core';

/**
 * The error line under a form, as the panel shows a wrong code or password: small red centered text, announced to
 * screen readers. The panel has no banners on its sign-in screens.
 */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <Text c="red" fz="xs" role="alert" ta="center">
      {message}
    </Text>
  );
}
