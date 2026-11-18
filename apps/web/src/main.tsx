// Fonts are self-hosted (SIL OFL): nothing is loaded from a third-party CDN.
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/fira-mono/400.css';
import '@mantine/core/styles.css';
import '@swellwright/ui/styles.css';

import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { theme } from '@swellwright/ui';

import { App } from './app.js';
import './i18n.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element.');
}

createRoot(root).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
