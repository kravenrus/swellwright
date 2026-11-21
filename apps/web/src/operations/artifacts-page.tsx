// The page is built like the panel's list pages (the plugins and config profiles pages, `EntityCard` rows) and its detail
// dialog like the panel's data-dense dialogs: `SectionCard`s with `DataList` rows, a sticky `ModalFooter`. The catalogue
// of artifacts has no counterpart in the panel.
import {
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Menu,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconDownload,
  IconInfoCircle,
  IconListCheck,
  IconPackage,
  IconPackages,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PiCheck, PiCopy } from 'react-icons/pi';

import type {
  ArtifactManifest,
  ArtifactParam,
  ArtifactStep,
  ArtifactView,
  ArtifactVersionView,
} from '@swellwright/contracts';
import {
  Callout,
  CopyableCodeBlock,
  CopyableDataListItem,
  EntityCard,
  ErrorMessageBlock,
  HeaderAction,
  HeaderActions,
  LoadingScreen,
  ModalFooter,
  OverlayHeader,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '@swellwright/ui';

import { artifactDownloadPath, listArtifacts } from '../api.js';
import { describeError } from '../auth/messages.js';
import { useBytes } from '../format.js';
import {
  DetailList,
  DetailRow,
  FailureCard,
  MODAL_SIZE,
  useCopyLabels,
} from '../settings/plugin-shared.js';
import { useIsMobile } from '../shell/use-is-mobile.js';

/** The chips must not be squeezed or cut inside the card's single row. */
const CHIP_STYLES = {
  root: { flexShrink: 0, width: 'max-content' },
  label: { overflow: 'visible' },
};

/** The version a card and a dialog start with: the latest intact one, or the first there is. */
function defaultVersion(artifact: ArtifactView): ArtifactVersionView | undefined {
  return (
    artifact.versions.find((version) => version.version === artifact.latestVersion) ??
    artifact.versions[0]
  );
}

/** A short hash with a copy button, for a card: the whole hash is in the dialog. Stops the click from opening the card. */
function HashChip({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation('common');
  return (
    <CopyButton timeout={2000} value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? t('copied') : label}>
          <Badge
            aria-label={label}
            color={copied ? 'teal' : 'gray'}
            component="button"
            ff="monospace"
            maw="none"
            onClick={(event: { stopPropagation: () => void }) => {
              event.stopPropagation();
              copy();
            }}
            rightSection={copied ? <PiCheck size={12} /> : <PiCopy size={12} />}
            size="lg"
            styles={{ ...CHIP_STYLES, root: { ...CHIP_STYLES.root, cursor: 'pointer' } }}
            tt="none"
            type="button"
            variant="soft"
            // On a phone the chips would drop to a third row; the menu of the card copies the hash there.
            visibleFrom="sm"
          >
            {value.slice(0, 12)}
          </Badge>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function ArtifactCard({
  artifact,
  onOpen,
}: {
  artifact: ArtifactView;
  onOpen: (name: string) => void;
}) {
  const { t } = useTranslation(['artifacts', 'common']);
  const formatBytes = useBytes();
  const shown = defaultVersion(artifact);
  const intact = artifact.latestVersion !== null;
  const manifest = shown?.manifest ?? null;
  const problem = shown?.problem ?? null;
  // Version, size and the number of versions in one dimmed line, so that the chips of a card fit its row.
  const facts = [
    shown?.version ?? t('card.malformed'),
    ...(shown?.size ? [formatBytes(shown.size)] : []),
    ...(artifact.versions.length > 1
      ? [t('card.versions', { count: artifact.versions.length })]
      : []),
  ];
  const chip = (
    <StatusBadge kind={intact ? 'ok' : 'err'} maw="none" styles={CHIP_STYLES}>
      {intact ? t('states.ok') : t('states.broken')}
    </StatusBadge>
  );
  return (
    <EntityCard.Root
      aria-label={t('card.openAria', { name: artifact.name })}
      isActive={intact}
      onClick={() => {
        onOpen(artifact.name);
      }}
      wrap
    >
      <EntityCard.Header>
        <EntityCard.Icon highlight={intact}>
          <IconPackage size={22} />
        </EntityCard.Icon>

        <EntityCard.Content
          badges={
            <>
              {facts.length > 0 ? (
                <Text c="dimmed" fz="xs" style={{ flexShrink: 0 }}>
                  {facts.join(' · ')}
                </Text>
              ) : null}
              {problem !== null && !intact ? (
                <Tooltip label={problem} multiline w={320}>
                  {chip}
                </Tooltip>
              ) : (
                chip
              )}
              {shown?.sha256 ? (
                <HashChip
                  label={t('card.hashCopyAria', { name: artifact.name })}
                  value={shown.sha256}
                />
              ) : null}
            </>
          }
          tags={manifest ? [manifest.interpreter === 'none' ? 'file' : manifest.interpreter] : []}
          title={artifact.name}
        />
      </EntityCard.Header>

      <EntityCard.Actions>
        <EntityCard.Menu label={t('card.menuAria', { name: artifact.name })}>
          <Menu.Item
            leftSection={<IconInfoCircle size={18} />}
            onClick={() => {
              onOpen(artifact.name);
            }}
          >
            {t('card.open')}
          </Menu.Item>
          {intact && artifact.latestVersion !== null ? (
            <Menu.Item
              color="teal"
              component="a"
              download
              href={artifactDownloadPath(artifact.name, artifact.latestVersion)}
              leftSection={<IconDownload size={18} />}
            >
              {t('card.download')}
            </Menu.Item>
          ) : null}
          {shown?.sha256 ? (
            <CopyButton timeout={2000} value={shown.sha256}>
              {({ copied, copy }) => (
                <Menu.Item
                  {...(copied ? { color: 'teal' } : {})}
                  leftSection={copied ? <PiCheck size={18} /> : <PiCopy size={18} />}
                  onClick={copy}
                >
                  {t('card.copyHash')}
                </Menu.Item>
              )}
            </CopyButton>
          ) : null}
          <CopyButton timeout={2000} value={artifact.name}>
            {({ copied, copy }) => (
              <Menu.Item
                {...(copied ? { color: 'teal' } : {})}
                leftSection={copied ? <PiCheck size={18} /> : <PiCopy size={18} />}
                onClick={copy}
              >
                {t('card.copyName')}
              </Menu.Item>
            )}
          </CopyButton>
        </EntityCard.Menu>
      </EntityCard.Actions>
    </EntityCard.Root>
  );
}

/** The steps of the manifest: what each does, whether it changes the server, and what it reads. */
function StepsSection({ steps }: { steps: readonly ArtifactStep[] }) {
  const { t } = useTranslation('artifacts');
  return (
    <SectionCard.Root>
      <SectionCard.Section>
        <OverlayHeader
          icon={IconListCheck}
          iconColor="cyan"
          iconSize={18}
          subtitle={t('steps.subtitle')}
          title={t('steps.title')}
          titleOrder={5}
        />
      </SectionCard.Section>
      <SectionCard.Section>
        {steps.length === 0 ? (
          <Text c="dimmed" fz="sm">
            {t('steps.none')}
          </Text>
        ) : (
          <DetailList>
            {steps.map((step) => (
              <DetailRow
                key={step.id}
                label={
                  <Group gap={8} wrap="nowrap">
                    <Text ff="monospace" fw={600} fz="sm">
                      {step.id}
                    </Text>
                    <Text c="dimmed" fz="sm">
                      {step.title}
                    </Text>
                  </Group>
                }
              >
                <Stack gap={6}>
                  <Group gap={6} wrap="wrap">
                    <Badge color={step.readOnly ? 'teal' : 'orange'} size="md" variant="soft">
                      {step.readOnly ? t('steps.readOnly') : t('steps.changes')}
                    </Badge>
                    {step.needsRoot ? (
                      <Badge color="gray" size="md" variant="soft">
                        {t('steps.root')}
                      </Badge>
                    ) : null}
                    {step.inFull ? (
                      <Badge color="cyan" size="md" variant="soft">
                        {t('steps.inFull')}
                      </Badge>
                    ) : null}
                  </Group>
                  {step.params.length > 0 ? (
                    <Text c="dimmed" ff="monospace" fz="xs" style={{ wordBreak: 'break-word' }}>
                      {t('steps.reads')}: {step.params.join(', ')}
                    </Text>
                  ) : null}
                  {step.requires.length > 0 ? (
                    <Text c="dimmed" ff="monospace" fz="xs" style={{ wordBreak: 'break-word' }}>
                      {t('steps.requires')}: {step.requires.join(', ')}
                    </Text>
                  ) : null}
                </Stack>
              </DetailRow>
            ))}
          </DetailList>
        )}
      </SectionCard.Section>
    </SectionCard.Root>
  );
}

function ParamRow({ name, param }: { name: string; param: ArtifactParam }) {
  const { t } = useTranslation('artifacts');
  const format = param.enum ? param.enum.join(', ') : (param.pattern ?? null);
  return (
    <DetailRow
      label={
        <Text ff="monospace" fw={600} fz="sm">
          {name}
        </Text>
      }
    >
      <Stack gap={6}>
        <Text fz="sm">{param.description}</Text>
        <Group gap={6} wrap="wrap">
          {param.required ? (
            <Badge color="orange" size="md" variant="soft">
              {t('params.required')}
            </Badge>
          ) : null}
          {param.secret ? (
            <Badge color="red" size="md" variant="soft">
              {t('params.secret')}
            </Badge>
          ) : null}
        </Group>
        {param.default !== null ? (
          <Text c="dimmed" fz="xs">
            {t('params.default')}:{' '}
            <Text component="span" ff="monospace" fz="xs">
              {param.default}
            </Text>
          </Text>
        ) : null}
        {format !== null ? (
          <Text c="dimmed" fz="xs" style={{ wordBreak: 'break-word' }}>
            {param.enum ? t('params.values') : t('params.format')}:{' '}
            <Text component="span" ff="monospace" fz="xs">
              {format}
            </Text>
          </Text>
        ) : null}
        {param.example !== undefined ? (
          <Text c="dimmed" fz="xs">
            {t('params.example')}:{' '}
            <Text component="span" ff="monospace" fz="xs">
              {param.example}
            </Text>
          </Text>
        ) : null}
      </Stack>
    </DetailRow>
  );
}

/** The parameters of the manifest, a card per group (node, installer, ...). */
function ParamsSections({ params }: { params: ArtifactManifest['params'] }) {
  const { t } = useTranslation('artifacts');
  const entries = Object.entries(params);
  const groups = [...new Set(entries.map(([, param]) => param.group))];
  if (entries.length === 0) {
    return (
      <SectionCard.Root>
        <SectionCard.Section>
          <OverlayHeader
            icon={IconSettings}
            iconColor="violet"
            iconSize={18}
            subtitle={t('params.subtitle')}
            title={t('params.title')}
            titleOrder={5}
          />
        </SectionCard.Section>
        <SectionCard.Section>
          <Text c="dimmed" fz="sm">
            {t('params.none')}
          </Text>
        </SectionCard.Section>
      </SectionCard.Root>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <SectionCard.Root key={group}>
          <SectionCard.Section>
            <OverlayHeader
              icon={IconSettings}
              iconColor="violet"
              iconSize={18}
              subtitle={t('params.subtitle')}
              title={`${t('params.title')}: ${group === 'node' ? t('params.groups.node') : group === 'installer' ? t('params.groups.installer') : group}`}
              titleOrder={5}
            />
          </SectionCard.Section>
          <SectionCard.Section>
            <DetailList>
              {entries
                .filter(([, param]) => param.group === group)
                .map(([name, param]) => (
                  <ParamRow key={name} name={name} param={param} />
                ))}
            </DetailList>
          </SectionCard.Section>
        </SectionCard.Root>
      ))}
    </>
  );
}

function VersionDetails({ version }: { version: ArtifactVersionView }) {
  const { t } = useTranslation(['artifacts', 'common']);
  const labels = useCopyLabels();
  const formatBytes = useBytes();
  const manifest = version.manifest;
  return (
    <>
      {version.state === 'broken' ? (
        <Callout color="red" icon={<IconAlertTriangle size={20} />} title={t('broken.title')}>
          <Stack gap="xs">
            <Text c="gray.3" fz="sm">
              {t('broken.body')}
            </Text>
            {version.problem ? <ErrorMessageBlock message={version.problem} {...labels} /> : null}
          </Stack>
        </Callout>
      ) : null}

      {manifest === null ? (
        <Text c="dimmed" fz="sm">
          {t('detail.noVersion')}
        </Text>
      ) : (
        <>
          <SectionCard.Root>
            <SectionCard.Section>
              <OverlayHeader
                icon={IconInfoCircle}
                iconColor="blue"
                iconSize={18}
                title={t('detail.title')}
                titleOrder={5}
              />
            </SectionCard.Section>
            <SectionCard.Section>
              <Stack gap="sm">
                <Group gap="xs">
                  <StatusBadge kind={version.state === 'ok' ? 'ok' : 'err'}>
                    {t(`states.${version.state}`)}
                  </StatusBadge>
                </Group>
                <Text fz="sm">{manifest.description}</Text>
                <DetailList>
                  <CopyableDataListItem
                    {...labels}
                    label={t('detail.version')}
                    monospace
                    value={manifest.version}
                  />
                  <DetailRow label={t('detail.interpreter')}>
                    {t(`interpreters.${manifest.interpreter}`)}
                  </DetailRow>
                  <DetailRow label={t('detail.minOs')}>{manifest.minOs}</DetailRow>
                  <CopyableDataListItem
                    {...labels}
                    label={t('detail.file')}
                    monospace
                    value={manifest.file}
                  />
                  <DetailRow label={t('detail.size')}>
                    {formatBytes(manifest.size)} ({manifest.size.toLocaleString()} B)
                  </DetailRow>
                </DetailList>
                <CopyableCodeBlock
                  {...labels}
                  inputWrapperProps={{
                    label: t('detail.sha256'),
                    description: t('detail.sha256Hint'),
                  }}
                  size="small"
                  value={manifest.sha256}
                />
              </Stack>
            </SectionCard.Section>
          </SectionCard.Root>
          <StepsSection steps={manifest.steps} />
          <ParamsSections params={manifest.params} />
        </>
      )}
    </>
  );
}

/** The dialog of one artifact: its versions, details, steps and parameters, and the download. */
function ArtifactDialog({
  artifact,
  onClose,
}: {
  artifact: ArtifactView | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation(['artifacts', 'common']);
  const isMobile = useIsMobile();
  const [picked, setPicked] = useState<string | null>(null);
  const [shownName, setShownName] = useState<string | undefined>(undefined);
  // A new artifact starts with its own default version, not with the pick made for the last one.
  if (artifact !== undefined && artifact.name !== shownName) {
    setShownName(artifact.name);
    setPicked(null);
  }
  const version =
    artifact === undefined
      ? undefined
      : (artifact.versions.find((candidate) => candidate.version === picked) ??
        defaultVersion(artifact));
  const versions = artifact?.versions.filter((candidate) => candidate.version !== null) ?? [];
  const canDownload = version?.state === 'ok' && version.version !== null && artifact !== undefined;
  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('common:close') }}
      fullScreen={isMobile}
      onClose={onClose}
      opened={artifact !== undefined}
      size={MODAL_SIZE}
      title={
        artifact ? (
          <OverlayHeader
            icon={IconPackage}
            iconColor="teal"
            subtitle={version?.version ?? undefined}
            title={artifact.name}
          />
        ) : (
          ''
        )
      }
    >
      {artifact && version ? (
        <>
          <Stack gap="md">
            {versions.length > 1 ? (
              <Select
                allowDeselect={false}
                data={versions.flatMap((candidate) =>
                  candidate.version === null
                    ? []
                    : [
                        {
                          value: candidate.version,
                          label: `${candidate.version} · ${t(`states.${candidate.state}`)}`,
                        },
                      ],
                )}
                label={t('detail.versionPick')}
                onChange={setPicked}
                styles={{ label: { fontWeight: 500 } }}
                value={version.version}
              />
            ) : null}
            <VersionDetails version={version} />
            {canDownload ? (
              <Text c="dimmed" fz="xs">
                {t('download.hint')}
              </Text>
            ) : null}
          </Stack>
          <ModalFooter>
            {canDownload && version.version !== null ? (
              <Button
                color="teal"
                component="a"
                download
                href={artifactDownloadPath(artifact.name, version.version)}
                leftSection={<IconDownload size={16} />}
                size="md"
                variant="soft"
              >
                {t('download.button')}
              </Button>
            ) : null}
            <Button color="teal" onClick={onClose} size="md" variant="light">
              {t('common:close')}
            </Button>
          </ModalFooter>
        </>
      ) : null}
    </Modal>
  );
}

/**
 * The catalogue of built-in artifacts (Operations, Artifacts): every file with its hash, size, steps and parameters,
 * and whether it is intact. Reading needs `servers:read` (the route checks it); pushing to servers is on the drawer
 * of a server.
 */
export function ArtifactsPage() {
  const { t } = useTranslation(['artifacts', 'common']);
  const [opened, setOpened] = useState<string | undefined>(undefined);

  const list = useQuery({ queryKey: ['artifacts'], queryFn: listArtifacts, retry: false });
  const artifacts = list.data?.artifacts ?? [];
  const open = artifacts.find((artifact) => artifact.name === opened);

  return (
    <>
      <PageHeader
        actions={
          <HeaderActions>
            <HeaderAction
              icon={IconRefresh}
              label={t('common:refresh')}
              loading={list.isRefetching}
              onClick={() => void list.refetch()}
            />
          </HeaderActions>
        }
        description={t('header.description')}
        icon={<IconPackages size={24} />}
        title={t('header.title')}
      />

      {list.isPending ? (
        <LoadingScreen height="60vh" />
      ) : list.isError ? (
        <FailureCard
          message={describeError(t, list.error, t('signInAgain'), t('readForbidden'))}
          onRetry={() => void list.refetch()}
          retrying={list.isRefetching}
          title={t('loadFailedTitle')}
        />
      ) : artifacts.length === 0 ? (
        <SectionCard.Root p="xl">
          <SectionCard.Section>
            <OverlayHeader
              icon={IconPackages}
              iconColor="gray"
              subtitle={t('empty.text')}
              title={t('empty.title')}
            />
          </SectionCard.Section>
        </SectionCard.Root>
      ) : (
        // The panel fades its lists in over half a second.
        <motion.div
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Box style={{ paddingInline: 'calc(var(--mantine-spacing-md) - 4px)' }}>
            <SimpleGrid cols={{ base: 1, '1000px': 2 }} p={4} spacing={8} type="container">
              {artifacts.map((artifact) => (
                <ArtifactCard artifact={artifact} key={artifact.name} onOpen={setOpened} />
              ))}
            </SimpleGrid>
          </Box>
        </motion.div>
      )}

      <ArtifactDialog
        artifact={open}
        onClose={() => {
          setOpened(undefined);
        }}
      />
    </>
  );
}
