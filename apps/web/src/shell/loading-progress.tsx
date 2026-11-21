// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/loading-screen/loading-progress.tsx.
// Changes: none beyond the file layout.
import { nprogress } from '@mantine/nprogress';
import { useEffect } from 'react';

/**
 * Renders nothing and runs the bar at the top of the window while it is on screen. The panel shows this, not a
 * centered bar, while it finds out whether anybody is signed in.
 */
export function LoadingProgress() {
  useEffect(() => {
    nprogress.start();
    return () => {
      nprogress.complete();
    };
  }, []);

  return null;
}
