// Look of the Remnawave panel frontend 3.4.11 (AGPL-3.0-only) list tables: src/widgets/dashboard/hosts/hosts-datatable/
// hosts-datatable.widget.tsx and src/shared/ui/datatable/*, which render `@kastov/mantine-datatable` (MIT) with
// `borderRadius="sm" striped withColumnBorders withRowBorders withTableBorder highlightOnHover pinLastColumn` and columns
// that default to `noWrap` and `ellipsis`. That package is not a dependency of this project (see the report of the
// change that added this file); this is a plain Mantine `Table` dressed with the same colours, borders, spacing, sticky
// header, empty state and loading overlay. It has no column resizing, reordering or toggling and no virtualisation.
import {
  Box,
  getRadius,
  Loader,
  type MantineRadius,
  ScrollArea,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowUp, IconDatabaseOff, IconSelector } from '@tabler/icons-react';
import { type CSSProperties, type Key, type KeyboardEvent, type ReactNode, useRef } from 'react';

import { cx } from './internal.js';

export interface ListTableColumn<T> {
  /** The key of the column and, by default, the path (dots allowed) of the value in a record. */
  accessor: string;
  /** The header text; the accessor by default. */
  title?: ReactNode;
  /** Renders the cell; by default the value at `accessor`, or an en dash when it is empty. */
  render?: (record: T, index: number) => ReactNode;
  textAlign?: 'left' | 'center' | 'right';
  /** A fixed width (a number is pixels). Ellipsis needs one. */
  width?: number | string;
  /** Keep the cell on one line; true by default, as the panel's `defaultColumnProps`. */
  noWrap?: boolean;
  /** Cut an overlong value with an ellipsis; true by default. */
  ellipsis?: boolean;
  hidden?: boolean;
  /** Needs `sortStatus` and `onSortStatusChange` on the table. */
  sortable?: boolean;
  /** Stick the column to a side while the table scrolls sideways (the panel pins the actions column right). */
  pinned?: 'left' | 'right';
  titleClassName?: string;
  cellClassName?: string;
}

export interface ListTableSortStatus {
  columnAccessor: string;
  direction: 'asc' | 'desc';
}

export interface ListTableProps<T> {
  records: readonly T[];
  columns: readonly ListTableColumn<T>[];
  /** The key of a record: a path, or a function. 'id' by default. */
  idAccessor?: string | ((record: T) => Key);
  /** Makes the rows clickable (pointer cursor, focus ring, Enter and Space) as the panel's "open the entity". */
  onRowClick?: (record: T, index: number) => void;
  /** Accessible name of the table. */
  'aria-label'?: string;
  /** Show the loading overlay over the rows. */
  fetching?: boolean;
  /** Accessible name of the loading spinner, already translated. */
  loadingLabel?: string;
  /** Replaces the default empty state. */
  emptyState?: ReactNode;
  /** Text of the default empty state, already translated. */
  emptyText?: string;
  /** Fixed height; the body scrolls and the header stays. A number is pixels. */
  height?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  /** The panel turns all five on: striped, highlightOnHover, withColumnBorders, withRowBorders, withTableBorder. */
  striped?: boolean;
  highlightOnHover?: boolean;
  withColumnBorders?: boolean;
  withRowBorders?: boolean;
  withTableBorder?: boolean;
  /** 'sm' like the panel; use 0 inside a `DataTableCard.Content`. */
  borderRadius?: MantineRadius | (string & {});
  /** Keep the header at the top while the body scrolls; on by default. */
  stickyHeader?: boolean;
  sortStatus?: ListTableSortStatus;
  onSortStatusChange?: (status: ListTableSortStatus) => void;
  /** Called while the body is scrolled to within 40 px of its end, for loading the next page. */
  onScrollToBottom?: () => void;
  rowClassName?: (record: T, index: number) => string | undefined;
  className?: string;
}

function readPath(record: unknown, path: string): unknown {
  let current: unknown = record;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function plainCell(value: unknown): ReactNode {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return '–';
}

function sizeStyle(width: number | string | undefined): CSSProperties {
  return width === undefined ? {} : { width, minWidth: width, maxWidth: width };
}

/**
 * A list table in the look of the panel's data tables: the page background with striped rows, thin borders between
 * rows and columns, a sticky header, a pointer cursor on clickable rows, an empty state and a loading overlay.
 *
 * It is a plain Mantine `Table`, not the panel's data-table package: no column resizing, dragging or toggling, no
 * virtualisation. Sorting is controlled by the caller (`sortStatus`), and the caller sorts the records.
 */
export function ListTable<T>({
  records,
  columns,
  idAccessor = 'id',
  onRowClick,
  'aria-label': ariaLabel,
  fetching = false,
  loadingLabel,
  emptyState,
  emptyText = 'No records',
  height,
  minHeight,
  maxHeight,
  striped = true,
  highlightOnHover = true,
  withColumnBorders = true,
  withRowBorders = true,
  withTableBorder = true,
  borderRadius = 'sm',
  stickyHeader = true,
  sortStatus,
  onSortStatusChange,
  onScrollToBottom,
  rowClassName,
  className,
}: ListTableProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const visible = columns.filter((column) => column.hidden !== true);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (onScrollToBottom === undefined || viewport === null) return;
    if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 40) {
      onScrollToBottom();
    }
  };

  const idOf = (record: T, index: number): Key => {
    if (typeof idAccessor === 'function') return idAccessor(record);
    const value = readPath(record, idAccessor);
    return typeof value === 'string' || typeof value === 'number' ? value : index;
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, record: T, index: number) => {
    if (onRowClick === undefined) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    onRowClick(record, index);
  };

  const rootStyle: CSSProperties = {
    borderRadius: typeof borderRadius === 'number' ? borderRadius : getRadius(borderRadius),
    ...(height === undefined ? {} : { height }),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(maxHeight === undefined ? {} : { maxHeight }),
  };

  return (
    <Box
      aria-busy={fetching}
      className={cx('sw-list-table', className)}
      data-column-borders={withColumnBorders || undefined}
      data-hover={highlightOnHover || undefined}
      data-row-borders={withRowBorders || undefined}
      data-sticky={stickyHeader || undefined}
      data-striped={striped || undefined}
      data-with-border={withTableBorder || undefined}
      style={rootStyle}
    >
      <ScrollArea
        classNames={{ root: 'sw-list-table-scroll' }}
        onScrollPositionChange={handleScroll}
        viewportRef={viewportRef}
      >
        <Table
          className="sw-list-table-table"
          highlightOnHover={false}
          striped={false}
          withRowBorders={false}
          {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
        >
          <Table.Thead className="sw-list-table-head">
            <Table.Tr>
              {visible.map((column) => {
                const sortable = column.sortable === true && onSortStatusChange !== undefined;
                const sorted = sortStatus?.columnAccessor === column.accessor;
                const direction = sorted ? sortStatus.direction : undefined;
                const title = column.title ?? column.accessor;

                return (
                  <Table.Th
                    className={cx('sw-list-table-th', column.titleClassName)}
                    data-accessor={column.accessor}
                    data-pinned={column.pinned}
                    key={column.accessor}
                    style={{ textAlign: column.textAlign ?? 'left', ...sizeStyle(column.width) }}
                    {...(sortable
                      ? {
                          'aria-sort':
                            direction === undefined
                              ? ('none' as const)
                              : direction === 'asc'
                                ? ('ascending' as const)
                                : ('descending' as const),
                        }
                      : {})}
                  >
                    {sortable ? (
                      <UnstyledButton
                        className="sw-list-table-sort"
                        onClick={() => {
                          onSortStatusChange({
                            columnAccessor: column.accessor,
                            direction: direction === 'asc' ? 'desc' : 'asc',
                          });
                        }}
                        type="button"
                      >
                        <span className="sw-list-table-th-text">{title}</span>
                        {sorted ? (
                          <IconArrowUp
                            aria-hidden
                            className={cx(
                              'sw-list-table-sort-icon',
                              direction === 'desc' && 'sw-list-table-sort-icon--desc',
                            )}
                            size={14}
                          />
                        ) : (
                          <IconSelector
                            aria-hidden
                            className="sw-list-table-sort-icon sw-list-table-sort-icon--idle"
                            size={14}
                          />
                        )}
                      </UnstyledButton>
                    ) : (
                      <span className="sw-list-table-th-text">{title}</span>
                    )}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {records.map((record, index) => (
              <Table.Tr
                className={cx('sw-list-table-row', rowClassName?.(record, index))}
                data-clickable={onRowClick ? true : undefined}
                key={idOf(record, index)}
                {...(onRowClick === undefined
                  ? {}
                  : {
                      onClick: () => {
                        onRowClick(record, index);
                      },
                      onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                        onRowKeyDown(event, record, index);
                      },
                      tabIndex: 0,
                    })}
              >
                {visible.map((column) => (
                  <Table.Td
                    className={cx(
                      'sw-list-table-cell',
                      (column.noWrap ?? true) && 'sw-list-table-cell--nowrap',
                      (column.ellipsis ?? true) && 'sw-list-table-cell--ellipsis',
                      column.cellClassName,
                    )}
                    data-accessor={column.accessor}
                    data-pinned={column.pinned}
                    key={column.accessor}
                    style={{ textAlign: column.textAlign ?? 'left', ...sizeStyle(column.width) }}
                  >
                    {column.render
                      ? column.render(record, index)
                      : plainCell(readPath(record, column.accessor))}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
            {records.length === 0 ? (
              <Table.Tr aria-hidden className="sw-list-table-empty-row">
                <Table.Td
                  className="sw-list-table-empty-cell"
                  colSpan={Math.max(visible.length, 1)}
                />
              </Table.Tr>
            ) : null}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {records.length === 0 && !fetching ? (
        <div className="sw-list-table-empty">
          {emptyState ?? (
            <>
              <div className="sw-list-table-empty-icon">
                <IconDatabaseOff aria-hidden size={32} />
              </div>
              <Text c="dimmed" size="sm">
                {emptyText}
              </Text>
            </>
          )}
        </div>
      ) : null}

      <div
        aria-hidden={!fetching}
        className="sw-list-table-loader"
        data-active={fetching || undefined}
      >
        {fetching ? (
          <Loader
            size="lg"
            {...(loadingLabel === undefined ? {} : { 'aria-label': loadingLabel })}
          />
        ) : null}
      </div>
    </Box>
  );
}
