import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { cx, IconButton } from './ui/index.jsx';

/** Bell with unread count (refreshed every 30 s) and a dropdown of recent notifications. */
export function NotificationBell({ allLink, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const queryClient = useQueryClient();
  const { data: count } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const { data: list } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api('/notifications', { query: { pageSize: 6 } }),
    enabled: open,
  });

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markOne = (id) => api(`/notifications/${id}/read`, { method: 'POST' }).then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }));

  return (
    <div ref={ref} className="relative">
      <IconButton label="Notifications" icon={Bell} badge={count?.count} onClick={() => setOpen((o) => !o)} className={className} />
      {open && (
        <div className="animate-fade-in absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl bg-white text-slate-800 shadow-pop ring-1 ring-slate-900/5">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {count?.count > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-semibold text-brand-700 hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {list?.items?.length ? (
              list.items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link ?? allLink}
                    onClick={() => {
                      if (!n.readAt) markOne(n.id);
                      setOpen(false);
                    }}
                    className={cx('block px-4 py-3 hover:bg-slate-50', !n.readAt && 'bg-brand-50/50')}
                  >
                    <p className="flex items-start gap-2 text-sm font-medium">
                      {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-500" aria-label="Unread" />}
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                  </Link>
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-slate-500">You’re all caught up.</li>
            )}
          </ul>
          <Link to={allLink} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
