import { useQuery } from '@tanstack/react-query';

import { getUpdates, getVersion } from '../api.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** What this build is: the number, the build and the commit. Changes only when the server is replaced. */
export function useVersionInfo() {
  return useQuery({
    queryKey: ['system', 'version'],
    queryFn: getVersion,
    staleTime: HOUR,
    refetchOnWindowFocus: false,
  });
}

/**
 * The newest release and the stars of the project, which the server reads from GitHub at most once a day. Never
 * seeded with made-up numbers: until the server knows, they are null and the controls say nothing.
 */
export function useUpdateInfo() {
  return useQuery({
    queryKey: ['system', 'updates'],
    queryFn: getUpdates,
    staleTime: DAY,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

const numbers = (version: string): number[] | undefined => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+.*)?$/u.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
};

/** True when `latest` is a higher release than `current`. A version that cannot be read is never newer. */
export function isNewerVersion(latest: string | null, current: string | null): boolean {
  if (latest === null || current === null) {
    return false;
  }
  const a = numbers(latest);
  const b = numbers(current);
  if (a === undefined || b === undefined) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) {
      return x > y;
    }
  }
  return false;
}
