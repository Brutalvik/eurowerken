import type { ReactNode } from 'react';

/**
 * How a column shows on phones (< md), where rows become cards:
 * - title:   card heading, top left (default: the first column)
 * - corner:  top right, for a status badge or total
 * - footer:  full width under the details, for action buttons
 * - hide:    left out on phones
 * - (unset): a label and value pair in the card body
 */
export type MobileSlot = 'title' | 'corner' | 'footer' | 'hide';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  mobile?: MobileSlot;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string | number;
  emptyMessage?: string;
  /**
   * Below which width rows become cards. Defaults to md (phones) for narrow
   * tables and lg (phones and portrait tablets) for tables of 7+ columns,
   * which do not fit a portrait tablet beside the navigation rail.
   */
  cardsBelow?: 'md' | 'lg';
  /**
   * Mouse shortcut: clicking anywhere on a row calls this. Keyboard users
   * still need a real button or link inside the row that does the same.
   */
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  emptyMessage = 'No records found.',
  cardsBelow = columns.length >= 7 ? 'lg' : 'md',
  onRowClick,
}: DataTableProps<T>) {
  const clickable = onRowClick ? 'cursor-pointer hover:bg-surface2/60' : '';
  // Written out in full so Tailwind finds the class names.
  const cardsClass = cardsBelow === 'lg' ? 'lg:hidden' : 'md:hidden';
  const tableClass = cardsBelow === 'lg' ? 'hidden overflow-x-auto lg:block' : 'hidden overflow-x-auto md:block';
  const titleIndex = Math.max(
    0,
    columns.findIndex((c) => c.mobile === 'title'),
  );
  const title = columns[titleIndex];
  const corner = columns.filter((c) => c.mobile === 'corner');
  const footer = columns.filter((c) => c.mobile === 'footer');
  const details = columns.filter((c, i) => i !== titleIndex && !c.mobile);

  return (
    <>
      {/* Narrow screens: one card per row, no sideways scrolling. */}
      <div className={cardsClass}>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-fg2">{emptyMessage}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`space-y-3 px-4 py-3.5 text-xs ${clickable}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`min-w-0 ${title?.className ?? 'font-semibold text-fg'}`}>{title?.cell(row)}</div>
                  {corner.length > 0 && (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {corner.map((c) => (
                        <div key={c.header} className={c.className}>
                          {c.cell(row)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {details.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
                    {details.map((c) => (
                      <div key={c.header} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wider text-fg3">{c.header}</dt>
                        <dd className={`mt-0.5 break-words ${c.className ?? 'text-fg2'}`}>{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {footer.map((c) => (
                  <div key={c.header}>{c.cell(row)}</div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Wider screens: the table. */}
      <div className={tableClass}>
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line/40 bg-fg/[0.07]">
              {columns.map((col) => (
                <th
                  key={col.header}
                  scope="col"
                  className="px-4 py-2.5 text-left text-[13px] font-medium text-fg2"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-fg2">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={getKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-line/30 last:border-b-0 ${clickable}`}
                >
                  {columns.map((col) => (
                    <td key={col.header} className={`px-4 py-3 ${col.className ?? 'text-fg'}`}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
