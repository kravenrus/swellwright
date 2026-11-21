// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/pages/dashboard/hosts/ui/components/
// hosts.page.component.tsx and src/pages/dashboard/nodes/ui/components/nodes.page.component.tsx. The page header card with
// the icon-only actions (refresh, create), the loading bar, and the datatable. Changes: no cards view, no spotlight and no
// bulk bar (the panel's other tools of these pages have nothing to act on yet); a list that could not be read shows
// the failed-load card.
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiServer } from 'react-icons/hi';

import type { Permission } from '@swellwright/contracts';
import {
  HeaderAction,
  HeaderActionGroup,
  HeaderActions,
  LoadingScreen,
  PageHeader,
} from '@swellwright/ui';

import { listServers } from '../api.js';
import { describeError } from '../auth/messages.js';
import { QueryErrorCard } from '../security/query-error.js';
import { type DrawerTarget, ServerDrawer } from './server-drawer.js';
import { ServersTable } from './servers-table.js';

/** How often the list reads the inventory again by itself, as the panel's Hosts table does. */
const REFRESH_MS = 60_000;

/** The servers of the fleet. Reading needs `servers:read`; adding, changing and deleting need `servers:write`. */
export function ServersPage({ permissions }: { permissions: readonly Permission[] }) {
  const { t } = useTranslation(['servers', 'common', 'errors']);
  const canWrite = permissions.includes('servers:write');
  const [target, setTarget] = useState<DrawerTarget>(undefined);

  const list = useQuery({
    queryKey: ['servers'],
    queryFn: () => listServers(),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const servers = useMemo(() => list.data?.servers ?? [], [list.data]);
  const tagSuggestions = useMemo(
    () => [...new Set(servers.flatMap((server) => server.tags))].sort(),
    [servers],
  );

  return (
    <>
      <PageHeader
        actions={
          <HeaderActions>
            <HeaderActionGroup>
              <HeaderAction
                grouped
                icon={IconRefresh}
                label={t('common:refresh')}
                loading={list.isFetching}
                onClick={() => void list.refetch()}
              />
            </HeaderActionGroup>
            {canWrite ? (
              <HeaderActionGroup>
                <HeaderAction
                  color="teal"
                  grouped
                  icon={IconPlus}
                  label={t('header.add')}
                  onClick={() => {
                    setTarget({ kind: 'new' });
                  }}
                />
              </HeaderActionGroup>
            ) : null}
          </HeaderActions>
        }
        icon={<HiServer size={24} />}
        title={t('title')}
      />
      {list.isPending ? (
        <LoadingScreen height="60vh" />
      ) : list.isError ? (
        <QueryErrorCard
          message={describeError(t, list.error, t('signInAgain'), t('readForbidden'))}
          onRetry={() => void list.refetch()}
          title={t('loadFailed')}
        />
      ) : (
        <motion.div
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <ServersTable
            onCreate={
              canWrite
                ? () => {
                    setTarget({ kind: 'new' });
                  }
                : undefined
            }
            onOpen={(id) => {
              setTarget({ kind: 'edit', id });
            }}
            servers={servers}
          />
        </motion.div>
      )}
      <ServerDrawer
        onChange={setTarget}
        permissions={permissions}
        tagSuggestions={tagSuggestions}
        target={target}
      />
    </>
  );
}
