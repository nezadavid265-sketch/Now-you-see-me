import { Inbox } from 'lucide-react';
import { Pagination, Skeleton, cx } from './index.jsx';

/**
 * Responsive table: a classic table on desktop and stacked cards on phones.
 * columns: [{ key, header, render?(row), className?, hideOnMobile? }]
 */
export function DataTable({ columns, rows, loading, empty = 'Nothing to show yet.', onRowClick, pagination, onPageChange, rowKey = (r) => r.id, className }) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cx('px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase', c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c.key} className="px-4 py-3.5">
                          <Skeleton className="h-4 w-full max-w-[160px]" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows?.map((row) => (
                    <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cx(onRowClick && 'cursor-pointer hover:bg-slate-50')}>
                      {columns.map((c) => (
                        <td key={c.key} className={cx('px-4 py-3 align-middle text-slate-700', c.className)}>
                          {c.render ? c.render(row) : row[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-slate-100 md:hidden">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </li>
              ))
            : rows?.map((row) => (
                <li key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cx('space-y-1.5 p-4', onRowClick && 'cursor-pointer active:bg-slate-50')}>
                  {columns
                    .filter((c) => !c.hideOnMobile)
                    .map((c) => (
                      <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                        <span className="shrink-0 text-xs font-medium text-slate-500">{c.header}</span>
                        <span className="min-w-0 text-right text-slate-800">{c.render ? c.render(row) : row[c.key]}</span>
                      </div>
                    ))}
                </li>
              ))}
        </ul>

        {!loading && !rows?.length && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
            <Inbox className="size-8 text-slate-300" aria-hidden />
            {empty}
          </div>
        )}
      </div>
      {pagination && onPageChange && <Pagination pagination={pagination} onChange={onPageChange} />}
    </div>
  );
}
