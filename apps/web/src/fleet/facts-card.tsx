// Same card pattern as the host keys and the access entries (the panel's `SectionCard` with an `OverlayHeader`). The facts
// themselves arrive with the SSH layer; until then the card says so.
import { DataList, Text } from '@mantine/core';
import { IconListDetails } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { ServerView } from '@swellwright/contracts';
import { OverlayHeader, SectionCard } from '@swellwright/ui';

import { useTimeFirst } from '../security/time-first.js';

/** The scalar facts, as text. Lists and nested values wait for the SSH layer to say how they are shown. */
function scalarFacts(facts: Record<string, unknown>): [string, string][] {
  return Object.entries(facts).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? [[key, String(value)]]
      : [],
  );
}

export function FactsCard({ server }: { server: ServerView }) {
  const { t } = useTranslation('servers');
  const formatTime = useTimeFirst();
  const facts = server.facts;
  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader
          icon={IconListDetails}
          iconColor="blue"
          subtitle={
            facts
              ? t('facts.collected', { time: formatTime(facts.collectedAt), source: facts.source })
              : undefined
          }
          title={t('facts.title')}
          titleOrder={5}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        {facts ? (
          <DataList orientation="vertical" withDivider>
            {scalarFacts(facts.facts).map(([key, value]) => (
              <DataList.Item key={key}>
                <DataList.ItemLabel>{key}</DataList.ItemLabel>
                <DataList.ItemValue>{value}</DataList.ItemValue>
              </DataList.Item>
            ))}
          </DataList>
        ) : (
          <Text c="dimmed" size="sm">
            {t('facts.empty')}
          </Text>
        )}
      </SectionCard.Section>
    </SectionCard.Root>
  );
}
