import { Box, type BoxProps } from '@mantine/core';
import { nprogress } from '@mantine/nprogress';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';

/** The name shown in the title of the browser tab after the page name. */
const PRODUCT = 'Swellwright';

/**
 * The frame every page sits in, as the panel's Page (src/shared/ui/page/page.tsx): the title of the browser tab, the
 * top progress bar that runs between pages, and a fade-in with `motion`.
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
      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <Box {...others}>{children}</Box>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
