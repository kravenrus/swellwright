import {
  ActionIcon,
  Badge,
  Button,
  Card,
  createTheme,
  defaultVariantColorsResolver,
  InputBase,
  Notification,
  PasswordInput,
  Paper,
  parseThemeColor,
  rgba,
  Select,
  Switch,
  Table,
  Tabs,
  TextInput,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from '@mantine/core';

import { DARK, FONT_FAMILY, FONT_FAMILY_MONOSPACE, SHADED_GRAY } from './tokens.js';

const tuple = (values: readonly string[]): MantineColorsTuple =>
  values as unknown as MantineColorsTuple;

/** The panel's custom "soft" variant: a tinted gradient with a thin tinted border. */
const variantColorResolver: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input);
  if (input.variant === 'soft') {
    const parsed = parseThemeColor({
      color: input.color ?? 'gray',
      theme: input.theme,
      colorScheme: 'dark',
    });
    const c1 = input.theme.colors[parsed.color]?.[6] ?? '#15aabf';
    const c2 = input.theme.colors[parsed.color]?.[7] ?? '#1098ad';
    return {
      background: `linear-gradient(135deg, ${rgba(c1, 0.15)} 0%, ${rgba(c2, 0.1)} 100%)`,
      border: `1px solid ${rgba(c1, 0.3)}`,
      color: `var(--mantine-color-${parsed.color}-4)`,
      hover: rgba(input.theme.colors[parsed.color]?.[4] ?? c1, 0.1),
    };
  }
  return resolved;
};

/** Component defaults of the panel: radius md, tinted "light" buttons, outline badges and icon buttons. */
export const theme = createTheme({
  variantColorResolver,
  cursorType: 'pointer',
  fontFamily: FONT_FAMILY,
  fontFamilyMonospace: FONT_FAMILY_MONOSPACE,
  fontSmoothing: true,
  focusRing: 'never',
  white: '#ffffff',
  black: '#24292f',
  colors: { dark: tuple(DARK), 'shaded-gray': tuple(SHADED_GRAY) },
  primaryShade: 8,
  primaryColor: 'cyan',
  autoContrast: true,
  luminanceThreshold: 0.3,
  headings: { fontWeight: '600' },
  defaultRadius: 'md',
  components: {
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: 'md', variant: 'outline' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'md', variant: 'outline' } }),
    Button: Button.extend({
      defaultProps: { radius: 'md', variant: 'light' },
      styles: { root: { transition: 'all 0.2s ease' } },
    }),
    Card: Card.extend({ defaultProps: { radius: 'md', withBorder: true } }),
    InputBase: InputBase.extend({ defaultProps: { radius: 'md' } }),
    Notification: Notification.extend({ defaultProps: { radius: 'md' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { radius: 'md' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'md' } }),
    Select: Select.extend({ defaultProps: { radius: 'md' } }),
    Switch: Switch.extend({ defaultProps: { radius: 'md' } }),
    Table: Table.extend({ defaultProps: { highlightOnHover: true } }),
    Tabs: Tabs.extend({ defaultProps: { variant: 'unstyled' } }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'md' } }),
  },
});
