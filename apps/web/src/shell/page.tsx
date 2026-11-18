import { Box, type BoxProps } from '@mantine/core';
import { nprogress } from '@mantine/nprogress';
import { useEffect, type ReactNode } from 'react';

/** The name shown in the title of the browser tab after the page name. */
const PRODUCT = 'Swellwright';

/**
 * The frame every page sits in, as the panel's Page: the title of the browser tab, the top progress bar that runs
 * between pages, and a short fade-in.
 */
export function Page({
  title,
  children,
  ...others
}: { title: string; children: ReactNode } & BoxProps) {
  useEffect(() => {
    nprogress.complete();
    return () => {
      nprogress.start();
    };
  }, []);

  return (
    <>
      <title>{`${title} | ${PRODUCT}`}</title>
      <Box className="sw-page" {...others}>
        {children}
      </Box>
    </>
  );
}
