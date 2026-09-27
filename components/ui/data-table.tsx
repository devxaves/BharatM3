'use client';

import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { cx } from '@/lib/format';
import { expand, fastTransition } from '@/lib/motion';

export interface DataTableProps<T> {
  data: T[];
  // eslint-disable-next-line
  columns: ColumnDef<T, any>[];
  globalFilter?: string;
  renderExpanded?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  getRowId?: (row: T) => string;
  pageSize?: number;
  initialSorting?: SortingState;
  empty?: ReactNode;
  maxHeight?: number | string;
  rowClassName?: (row: T) => string | undefined;
  footerNote?: ReactNode;
}

/**
 * Dense, sortable, filterable data grid (TanStack Table). Motion is reserved for state changes only:
 * sort indicator, inline expansion, selection — never decorative per-cell animation (PRD §8.2).
 */
export function DataTable<T>({
  data,
  columns,
  globalFilter,
  renderExpanded,
  onRowClick,
  selectedId,
  getRowId,
  pageSize = 50,
  initialSorting = [],
  empty,
  maxHeight,
  rowClassName,
  footerNote,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded as never,
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
    getRowCanExpand: () => !!renderExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    globalFilterFn: 'includesString',
    initialState: { pagination: { pageSize } },
    autoResetPageIndex: true,
  });

  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const from = total ? pageIndex * pageSize + 1 : 0;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  const toggle = (row: Row<T>) => {
    if (renderExpanded) row.toggleExpanded();
    onRowClick?.(row.original);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="scroll-thin overflow-auto" style={{ maxHeight }}>
        <table className="dt">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sort = h.column.getIsSorted();
                  const can = h.column.getCanSort();
                  return (
                    <th key={h.id} style={h.getSize() !== 150 ? { width: h.getSize(), minWidth: h.getSize() } : undefined} className={cx((h.column.columnDef.meta as { align?: string })?.align === 'right' && 'text-right')}>
                      {h.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!can}
                          onClick={h.column.getToggleSortingHandler()}
                          className={cx('inline-flex items-center gap-1 uppercase', can ? 'cursor-pointer hover:text-grey-900' : 'cursor-default', sort && 'text-primary-800')}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {can && (
                            <motion.span key={String(sort)} initial={{ opacity: 0, y: sort === 'desc' ? -3 : 3 }} animate={{ opacity: 1, y: 0 }} transition={fastTransition} className="inline-flex">
                              {sort === 'asc' ? <ArrowUp size={11} /> : sort === 'desc' ? <ArrowDown size={11} /> : <ChevronsUpDown size={11} className="text-grey-300" />}
                            </motion.span>
                          )}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const selected = selectedId && getRowId ? getRowId(row.original) === selectedId : false;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => toggle(row)}
                    className={cx(
                      'dt-row group transition-colors duration-150',
                      i % 2 === 1 && 'dt-zebra',
                      (renderExpanded || onRowClick) && 'cursor-pointer',
                      selected ? '[&>td]:!bg-primary-50 [&>td:first-child]:shadow-[inset_3px_0_0_rgb(var(--c-primary-700))]' : '[&>td]:hover:!bg-primary-50/60',
                      row.getIsExpanded() && '[&>td]:!bg-grey-50',
                      rowClassName?.(row.original),
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cx((cell.column.columnDef.meta as { align?: string })?.align === 'right' && 'text-right')}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {renderExpanded && (
                    <tr>
                      <td colSpan={row.getVisibleCells().length} className="!h-0 !border-0 !p-0">
                        <AnimatePresence initial={false}>
                          {row.getIsExpanded() && (
                            <motion.div {...expand} className="overflow-hidden">
                              <div className="border-b border-grey-200 bg-grey-50 px-4 py-3 shadow-[inset_3px_0_0_rgb(var(--c-teal-600))]">{renderExpanded(row.original)}</div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (empty ?? <div className="px-4 py-10 text-center text-dense text-grey-500">No rows match the current filters.</div>)}
      </div>
      <div className="flex items-center justify-between border-t border-grey-200 bg-grey-25 px-3 py-1.5 text-caption text-grey-600">
        <span className="tabular">
          {from}–{to} of {total.toLocaleString('en-IN')}
          {footerNote && <span className="ml-3 text-grey-500">{footerNote}</span>}
        </span>
        <div className="flex items-center gap-1">
          <button className="rounded p-1 hover:bg-grey-100 disabled:opacity-30" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          <span className="tabular px-1">
            {pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <button className="rounded p-1 hover:bg-grey-100 disabled:opacity-30" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
