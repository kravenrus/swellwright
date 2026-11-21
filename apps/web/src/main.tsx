// Fonts are self-hosted (SIL OFL): nothing is loaded from a third-party CDN.
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/fira-mono/400.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/nprogress/styles.css';
import '@swellwright/ui/styles.css';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { NavigationProgress } from '@mantine/nprogress';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import flagFont from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { cssVariablesResolver, theme } from '@swellwright/ui';

import { App } from './app.js';
import './i18n.js';
import { ConnectionStatusOverlay } from './shell/connection-status.js';

// Windows draws no flag emoji. The font for them is self-hosted, like the others.
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFont);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element.');
}

createRoot(root).render(
  <StrictMode>
    <MantineProvider
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="dark"
      deduplicateInlineStyles
      theme={theme}
    >
      <ModalsProvider>
        <Notifications position="top-right" />
        <NavigationProgress />
        {/* The panel's entrances use `motion`; a person who asked their system for less motion gets none of them. */}
        <MotionConfig reducedMotion="user">
          <QueryClientProvider client={queryClient}>
            <ConnectionStatusOverlay />
            <App />
          </QueryClientProvider>
        </MotionConfig>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
