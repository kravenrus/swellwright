import {
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconBrandGithub,
  IconCalendar,
  IconCheck,
  IconCopy,
  IconGitBranch,
  IconHash,
  IconServer,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { UpdatesResponse, VersionResponse } from '@swellwright/contracts';
import { LogoMark, OverlayHeader } from '@swellwright/ui';

import { useNumericDateTime } from '../format.js';

/** A card with one fact of the build: an icon, a caption and a monospace value. */
function Fact({
  icon: Icon,
  color,
  caption,
  value,
  tint,
}: {
  icon: typeof IconCalendar;
  color: string;
  caption: string;
  value: string;
  tint: [string, string];
}) {
  return (
    <Paper p="sm" radius="md" style={{ background: tint[0], border: `1px solid ${tint[1]}` }}>
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap">
          <Icon color={`var(--mantine-color-${color}-5)`} size={14} />
          <Text c="dimmed" fz="xs" fw={500}>
            {caption}
          </Text>
        </Group>
        <Text c="gray.3" ff="monospace" fz="xs" style={{ wordBreak: 'break-all' }}>
          {value}
        </Text>
      </Stack>
    </Paper>
  );
}

function BuildInfo({
  version,
  updates,
  isNewVersion,
}: {
  version: VersionResponse;
  updates: UpdatesResponse | undefined;
  isNewVersion: boolean;
}) {
  const { t } = useTranslation('shell');
  const dateTime = useNumericDateTime();
  const unknown = t('buildInfo.unknown');
  const branch = version.git.branch;
  const isDev = branch !== null && branch !== 'main';
  const commit = version.git.commit;
  const buildTime = version.build.time;

  return (
    <Stack gap="md">
      {isNewVersion && updates ? (
        <Paper className="sw-update-card" p="md" radius="md">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <LogoMark size={28} />
              <Stack gap={0}>
                <Text c="teal.4" fw={600} size="sm">
                  {t('buildInfo.updateTitle')}
                </Text>
                <Text c="dimmed" size="xs">
                  {t('buildInfo.updateText')}
                  {updates.latestVersion ? ` ${updates.latestVersion}` : ''}
                </Text>
              </Stack>
            </Group>
            {updates.releaseUrl ? (
              <Button
                color="teal"
                component="a"
                href={updates.releaseUrl}
                radius="md"
                rel="noopener noreferrer"
                size="xs"
                target="_blank"
                variant="light"
              >
                {t('buildInfo.releaseNotes')}
              </Button>
            ) : null}
          </Group>
        </Paper>
      ) : null}

      <Paper className="sw-build-card" p="md" radius="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Badge color="cyan" leftSection={<LogoMark size={16} />} size="lg" variant="light">
                {version.version}
              </Badge>
              <Badge
                color={isDev ? 'red' : 'teal'}
                leftSection={<IconGitBranch size={16} />}
                size="lg"
                variant="light"
              >
                {branch ?? unknown}
              </Badge>
            </Group>
            <CopyButton timeout={2000} value={JSON.stringify(version, null, 2)}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t('buildInfo.copied') : t('buildInfo.copy')}>
                  <ActionIcon
                    aria-label={t('buildInfo.copy')}
                    color={copied ? 'teal' : 'gray'}
                    onClick={copy}
                    size="md"
                    variant="subtle"
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Divider opacity={0.3} />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Fact
              caption={t('buildInfo.buildTime')}
              color="indigo"
              icon={IconCalendar}
              tint={['rgba(99, 102, 241, 0.08)', 'rgba(99, 102, 241, 0.2)']}
              value={buildTime ? dateTime(buildTime) : unknown}
            />
            <Fact
              caption={t('buildInfo.build')}
              color="violet"
              icon={IconHash}
              tint={['rgba(139, 92, 246, 0.08)', 'rgba(139, 92, 246, 0.2)']}
              value={version.build.number ?? unknown}
            />
          </SimpleGrid>
        </Stack>
      </Paper>

      <Paper
        p="md"
        radius="md"
        style={{
          background: 'rgba(6, 182, 212, 0.06)',
          border: '1px solid rgba(6, 182, 212, 0.15)',
        }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <IconServer color="var(--mantine-color-cyan-5)" size={16} />
              <Text c="cyan.5" fw={600} size="sm">
                {t('buildInfo.commit')}
              </Text>
            </Group>
            {version.git.commitUrl ? (
              <Tooltip label={t('buildInfo.viewCommit')}>
                <ActionIcon
                  aria-label={t('buildInfo.viewCommit')}
                  component="a"
                  href={version.git.commitUrl}
                  rel="noopener noreferrer"
                  size="sm"
                  target="_blank"
                  variant="subtle"
                >
                  <IconBrandGithub size={14} />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </Group>
          <Text c="gray.3" ff="monospace" fz="xs" style={{ wordBreak: 'break-all' }}>
            {commit ?? unknown}
          </Text>
        </Stack>
      </Paper>

      {updates?.repositoryUrl ? (
        <Button
          component="a"
          fullWidth
          href={updates.repositoryUrl}
          leftSection={<IconBrandGithub size={16} />}
          radius="md"
          rel="noopener noreferrer"
          size="sm"
          target="_blank"
          variant="default"
        >
          {t('buildInfo.repository')}
        </Button>
      ) : null}
    </Stack>
  );
}

/** Opens the dialog with the build information, as the panel's Build Info. */
export function openBuildInfo({
  title,
  version,
  updates,
  isNewVersion,
}: {
  title: string;
  version: VersionResponse;
  updates: UpdatesResponse | undefined;
  isNewVersion: boolean;
}): void {
  modals.open({
    title: <OverlayHeader icon={IconServer} iconColor="teal" title={title} />,
    centered: true,
    size: 'md',
    withCloseButton: true,
    children: <BuildInfo isNewVersion={isNewVersion} updates={updates} version={version} />,
  });
}
