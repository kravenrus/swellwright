// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/ui/tag-input-pill/tag-input-pill.tsx, the
// pill the panel's tag inputs draw for every tag. Changes: the remove button has an accessible name.
import { Badge, CloseButton } from '@mantine/core';

export interface TagInputPillProps {
  onRemove?: () => void;
  value: string | undefined;
  /** Accessible name of the remove button, already translated. */
  removeLabel?: string;
}

/** For the `renderPill` of a Mantine `TagsInput`: a soft badge with a cyan remove button. */
export function TagInputPill({ onRemove, value, removeLabel }: TagInputPillProps) {
  return (
    <Badge
      leftSection={
        onRemove ? (
          <CloseButton
            aria-label={removeLabel ?? 'Remove'}
            c="cyan"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
            radius="xl"
            size={18}
            variant="transparent"
          />
        ) : null
      }
      pl={0}
      radius="sm"
      size="md"
      styles={{
        label: { overflow: 'visible' },
        root: { textTransform: 'none' },
        section: { margin: 0 },
      }}
      variant="soft"
    >
      {value}
    </Badge>
  );
}
