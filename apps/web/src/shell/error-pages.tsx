// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/pages/errors/4xx-error/{not-found.component.tsx,
// NotFound.module.css} and src/pages/errors/5xx-error/{server-error.component.tsx,ServerError.module.css}. The drawing
// of the digits 4, 0, 4 is the "nothing found" illustration of the Mantine UI examples (MIT) that the panel uses.
// Changes: the CSS modules became `sw-error-*` rules; the texts come from i18n; the details of a 500 are in the
// console's copyable block (the panel uses a code highlighter component that the console does not depend on);
// the error comes from the router.
import { Box, Button, Container, Group, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRouteError } from 'react-router';

import { CopyableCodeBlock } from '@swellwright/ui';

import { ROUTES } from '../routes.js';

/** The drawing behind the "nothing here" page: the digits 404 in a big, soft gray. */
function Illustration(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden viewBox="0 0 362 145" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M62.6 142c-2.133 0-3.2-1.067-3.2-3.2V118h-56c-2 0-3-1-3-3V92.8c0-1.333.4-2.733 1.2-4.2L58.2 4c.8-1.333 2.067-2 3.8-2h28c2 0 3 1 3 3v85.4h11.2c.933 0 1.733.333 2.4 1 .667.533 1 1.267 1 2.2v21.2c0 .933-.333 1.733-1 2.4-.667.533-1.467.8-2.4.8H93v20.8c0 2.133-1.067 3.2-3.2 3.2H62.6zM33 90.4h26.4V51.2L33 90.4zM181.67 144.6c-7.333 0-14.333-1.333-21-4-6.666-2.667-12.866-6.733-18.6-12.2-5.733-5.467-10.266-13-13.6-22.6-3.333-9.6-5-20.667-5-33.2 0-12.533 1.667-23.6 5-33.2 3.334-9.6 7.867-17.133 13.6-22.6 5.734-5.467 11.934-9.533 18.6-12.2 6.667-2.8 13.667-4.2 21-4.2 7.467 0 14.534 1.4 21.2 4.2 6.667 2.667 12.8 6.733 18.4 12.2 5.734 5.467 10.267 13 13.6 22.6 3.334 9.6 5 20.667 5 33.2 0 12.533-1.666 23.6-5 33.2-3.333 9.6-7.866 17.133-13.6 22.6-5.6 5.467-11.733 9.533-18.4 12.2-6.666 2.667-13.733 4-21.2 4zm0-31c9.067 0 15.6-3.733 19.6-11.2 4.134-7.6 6.2-17.533 6.2-29.8s-2.066-22.2-6.2-29.8c-4.133-7.6-10.666-11.4-19.6-11.4-8.933 0-15.466 3.8-19.6 11.4-4 7.6-6 17.533-6 29.8s2 22.2 6 29.8c4.134 7.467 10.667 11.2 19.6 11.2zM316.116 142c-2.134 0-3.2-1.067-3.2-3.2V118h-56c-2 0-3-1-3-3V92.8c0-1.333.4-2.733 1.2-4.2l56.6-84.6c.8-1.333 2.066-2 3.8-2h28c2 0 3 1 3 3v85.4h11.2c.933 0 1.733.333 2.4 1 .666.533 1 1.267 1 2.2v21.2c0 .933-.334 1.733-1 2.4-.667.533-1.467.8-2.4.8h-11.2v20.8c0 2.133-1.067 3.2-3.2 3.2h-27.2zm-29.6-51.6h26.4V51.2l-26.4 39.2z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The page for an address that leads nowhere. Full screen, outside the console's header, as in the panel. */
export function NotFoundPage() {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();

  return (
    <Container className="sw-error-page">
      <title>{`${t('notFound.title')} | Swellwright`}</title>
      <div className="sw-error-inner">
        <Illustration className="sw-error-image" />
        <div className="sw-error-content">
          <Title className="sw-error-title">{t('notFound.title')}</Title>
          <Text c="dimmed" className="sw-error-description" size="lg" ta="center">
            {t('notFound.text')}
          </Text>
          <Group justify="center">
            <Button
              onClick={() => {
                void navigate(ROUTES.DASHBOARD.HOME);
              }}
              size="md"
            >
              {t('notFound.action')}
            </Button>
          </Group>
        </div>
      </div>
    </Container>
  );
}

/** The page for something that broke while drawing the console: the number, a line, a refresh button and the details. */
export function ServerErrorPage() {
  const { t } = useTranslation(['shell', 'common']);
  const navigate = useNavigate();
  const error: unknown = useRouteError();

  const details =
    error instanceof Error
      ? (error.stack ?? error.message)
      : typeof error === 'string'
        ? error
        : '';

  return (
    <div className="sw-error-page">
      <title>{`${t('serverError.title')} | Swellwright`}</title>
      <Container>
        <div className="sw-error-label">500</div>
        <Title className="sw-error-title">{t('serverError.title')}</Title>
        <Group justify="center" mt="xl">
          <Button
            onClick={() => {
              void navigate(0);
            }}
            size="md"
            variant="soft"
          >
            {t('serverError.refresh')}
          </Button>
        </Group>
        {details ? (
          <Box mt="xl">
            <CopyableCodeBlock
              copiedLabel={t('common:copied')}
              copyLabel={t('common:copy')}
              maxHeight={240}
              multiline
              regionLabel={t('serverError.details')}
              size="small"
              value={details}
            />
          </Box>
        ) : null}
      </Container>
    </div>
  );
}
