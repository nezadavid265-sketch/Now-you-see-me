import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api.js';
import { dateTime } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { Button, Card, EmptyState, PageHeader, Pagination, Skeleton, Tabs, cx } from '../ui/index.jsx';

export function NotificationsPanel() {
  usePageTitle('Notifications');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list', page, filter],
    queryFn: () => api('/notifications', { query: { page, unread: filter === 'unread' ? 'true' : undefined } }),
    refetchInterval: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = () => api('/notifications/read-all', { method: 'POST' }).then(refresh);
  const markOne = (id) => api(`/notifications/${id}/read`, { method: 'POST' }).then(refresh);

  return (
    <div>
      <PageHeader title="Notifications" description="Order updates, payments and messages from Rivoshoppa." actions={<Button variant="outline" onClick={markAll}>Mark all as read</Button>} />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
        ]}
      />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState icon={Bell} title="No notifications" description="We’ll let you know when something needs your attention." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {data.items.map((n) => (
              <li key={n.id} className={cx('flex items-start gap-3 px-5 py-4', !n.readAt && 'bg-brand-50/40')}>
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent-500')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{dateTime(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {n.link && (
                    <Link to={n.link} onClick={() => !n.readAt && markOne(n.id)} className="text-sm font-semibold text-brand-700 hover:underline">
                      Open
                    </Link>
                  )}
                  {!n.readAt && (
                    <button type="button" onClick={() => markOne(n.id)} className="text-xs text-slate-500 hover:text-slate-700">
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination pagination={data?.pagination} onChange={setPage} />
    </div>
  );
}
