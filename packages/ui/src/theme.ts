import {
  ActionIcon,
  Badge,
  Button,
  Card,
  CloseButton,
  Combobox,
  createTheme,
  defaultVariantColorsResolver,
  Drawer,
  DrawerOverlay,
  InputBase,
  LoadingOverlay,
  Menu,
  Modal,
  Notification,
  PasswordInput,
  Paper,
  parseThemeColor,
  rgba,
  RingProgress,
  SegmentedControl,
  Select,
  Switch,
  Table,
  Tabs,
  TextInput,
  Tooltip,
  v8CssVariablesResolver,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from '@mantine/core';

import { BREAKPOINTS, DARK, FONT_FAMILY, FONT_FAMILY_MONOSPACE, SHADED_GRAY } from './tokens.js';

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

/**
 * The panel renders every "light" surface (buttons, badges, theme icons, alerts) as a translucent tint with the -3
 * text shade, which is how Mantine 8 did it. Mantine 9 paints flat swatches instead, so the panel opts back in with
 * this resolver. Pass it to the MantineProvider as `cssVariablesResolver`.
 */
export const cssVariablesResolver = v8CssVariablesResolver;

/** Component defaults of the panel: radius md, tinted "light" buttons, outline badges and icon buttons. */
export const theme = createTheme({
  variantColorResolver,
  cursorType: 'pointer',
  fontFamily: FONT_FAMILY,
  fontFamilyMonospace: FONT_FAMILY_MONOSPACE,
  breakpoints: { ...BREAKPOINTS },
  scale: 1,
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
    CloseButton: CloseButton.extend({ defaultProps: { size: 'lg' } }),
    Combobox: Combobox.extend({
      defaultProps: { transitionProps: { transition: 'fade', duration: 200 } },
    }),
    Drawer: Drawer.extend({ defaultProps: { radius: 'md' } }),
    DrawerOverlay: DrawerOverlay.extend({ defaultProps: { backgroundOpacity: 0.6, blur: 0 } }),
    InputBase: InputBase.extend({ defaultProps: { radius: 'md' } }),
    LoadingOverlay: LoadingOverlay.extend({
      defaultProps: { zIndex: 1000, overlayProps: { radius: 'sm', blur: 4 } },
    }),
    Menu: Menu.extend({
      defaultProps: {
        shadow: 'lg',
        withArrow: false,
        radius: 'md',
        transitionProps: { transition: 'fade', duration: 180, timingFunction: 'ease-out' },
      },
      styles: {
        dropdown: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          border: '1px solid var(--mantine-color-dark-4)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)',
        },
        divider: { borderColor: 'var(--mantine-color-dark-5)', margin: '4px 0' },
      },
    }),
    Modal: Modal.extend({
      defaultProps: {
        radius: 'md',
        centered: true,
        transitionProps: { transition: 'fade', duration: 200 },
      },
    }),
    Notification: Notification.extend({ defaultProps: { radius: 'md' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { radius: 'md' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'md' } }),
    RingProgress: RingProgress.extend({ defaultProps: { thickness: 6, roundCaps: true } }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: 'md', transitionDuration: 200 },
    }),
    Select: Select.extend({ defaultProps: { radius: 'md' } }),
    Switch: Switch.extend({ defaultProps: { radius: 'md' } }),
    Table: Table.extend({ defaultProps: { highlightOnHover: true } }),
    Tabs: Tabs.extend({ defaultProps: { variant: 'unstyled' } }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'md' } }),
    Tooltip: Tooltip.extend({
      defaultProps: {
        radius: 'md',
        withArrow: true,
        arrowSize: 2,
        color: 'dark.6',
        transitionProps: { transition: 'scale-x', duration: 300 },
      },
      styles: { tooltip: { border: '1px solid var(--mantine-color-dark-4)' } },
    }),
  },
});
