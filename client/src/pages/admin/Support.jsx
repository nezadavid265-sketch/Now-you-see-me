import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Search, Send } from 'lucide-react';
import { api } from '../../lib/api.js';
import { dateTime, timeAgo, titleCase } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, DescriptionList, Input, PageHeader, PageLoader, Select, StatusBadge, Tabs, Textarea, cx } from '../../components/ui/index.jsx';

const PRIORITY_TONE = { LOW: 'slate', NORMAL: 'blue', HIGH: 'amber', URGENT: 'red' };

export function TicketsList() {
  usePageTitle('Support tickets');
  const navigate = useNavigate();
  const [params, update] = useListParams({ status: 'OPEN', type: '', mine: '', q: '', page: '1' });
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tickets', params],
    queryFn: () => api('/admin/tickets', { query: { ...params, status: params.status === 'ALL' ? undefined : params.status } }),
    placeholderData: (p) => p,
    refetchInterval: 30_000,
  });
  return (
    <div>
      <PageHeader title="Support tickets" description="Questions, complaints and disputes from buyers and sellers." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={params.status} onChange={(status) => update({ status })} tabs={[{ value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'CLOSED', label: 'Closed' }, { value: 'ALL', label: 'All' }]} />
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Type" value={params.type} onChange={(e) => update({ type: e.target.value })} placeholder="All types" options={['GENERAL', 'ORDER', 'PAYMENT', 'DELIVERY', 'REFUND', 'COMPLAINT', 'DISPUTE', 'SELLER_ACCOUNT'].map((t) => ({ value: t, label: titleCase(t) }))} className="w-44" />
          <Checkbox label="Assigned to me" checked={params.mine === 'true'} onChange={(e) => update({ mine: e.target.checked ? 'true' : '' })} className="self-center" />
          <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex gap-2">
            <Input aria-label="Search tickets" placeholder="Subject or number" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
          </form>
        </div>
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        onRowClick={(t) => navigate(`/admin/support/${t.id}`)}
        empty="No tickets in this list."
        columns={[
          { key: 'subject', header: 'Ticket', render: (t) => <div><p className="max-w-xs truncate font-medium">{t.subject}</p><p className="text-xs text-slate-500">{t.number} · {titleCase(t.type)}{t.order && ` · ${t.order.orderNumber}`}</p></div> },
          { key: 'from', header: 'From', render: (t) => <div className="text-xs"><p className="text-sm">{t.user.name}</p><p className="text-slate-500">{titleCase(t.user.role)}{t.shop && ` · re: ${t.shop.name}`}</p></div> },
          { key: 'priority', header: 'Priority', render: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{titleCase(t.priority)}</Badge> },
          { key: 'assigned', header: 'Assignee', hideOnMobile: true, render: (t) => t.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span> },
          { key: 'lastReplyAt', header: 'Last activity', render: (t) => timeAgo(t.lastReplyAt) },
          { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} label={t.status === 'IN_PROGRESS' ? 'In progress' : undefined} /> },
        ]}
      />
    </div>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'ticket', id], queryFn: () => api(`/admin/tickets/${id}`), refetchInterval: 20_000 });
  usePageTitle(data?.ticket.subject ?? 'Ticket');
  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const t = data.ticket;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', id] });
  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api(`/admin/tickets/${id}/messages`, { method: 'POST', body: { body: reply, isInternal: internal } });
      setReply('');
      setInternal(false);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };
  const updateTicket = async (patch) => {
    try {
      await api(`/admin/tickets/${id}`, { method: 'PATCH', body: patch });
      toast.success('Ticket updated');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/admin/tickets', label: 'Tickets' }} title={t.subject} description={`${t.number} · ${titleCase(t.type)} · opened ${dateTime(t.createdAt)}`} actions={<StatusBadge status={t.status} label={t.status === 'IN_PROGRESS' ? 'In progress' : undefined} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ol className="space-y-4">
            {t.messages.map((m) => {
              const staff = m.author.role === 'ADMIN';
              return (
                <li key={m.id} className={cx('rounded-xl p-4', m.isInternal ? 'border border-dashed border-amber-300 bg-amber-50' : staff ? 'bg-brand-50' : 'bg-slate-50')}>
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    {m.author.name} <Badge tone={staff ? 'brand' : 'slate'}>{titleCase(m.author.role)}</Badge>
                    {m.isInternal && <Badge tone="amber"><Lock className="size-3" /> Internal note</Badge>}
                    <span className="font-normal text-slate-400">{dateTime(m.createdAt)}</span>
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-slate-800">{m.body}</p>
                </li>
              );
            })}
          </ol>
          <form onSubmit={send} className="mt-6 space-y-3 border-t border-slate-100 pt-4">
            <Textarea label={internal ? 'Internal note (only visible to staff)' : 'Reply to customer'} rows={4} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Checkbox label="Internal note" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <Button type="submit" icon={Send} loading={sending} disabled={!reply.trim()}>{internal ? 'Add note' : 'Send reply'}</Button>
            </div>
          </form>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Manage" />
            <div className="space-y-3">
              <Select label="Status" value={t.status} onChange={(e) => updateTicket({ status: e.target.value })} options={['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => ({ value: s, label: titleCase(s) }))} />
              <Select label="Priority" value={t.priority} onChange={(e) => updateTicket({ priority: e.target.value })} options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => ({ value: s, label: titleCase(s) }))} />
              <Select label="Assignee" value={t.assignedTo?.id ?? ''} onChange={(e) => updateTicket({ assignedToId: e.target.value || null })} placeholder="Unassigned" options={data.admins.map((a) => ({ value: a.id, label: a.name }))} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Customer" />
            <DescriptionList className="sm:grid-cols-1" items={[
              ['Name', <Link key="u" to={`/admin/users/${t.user.id}`} className="text-brand-700 hover:underline">{t.user.name}</Link>],
              ['Role', titleCase(t.user.role)],
              ['Email', t.user.email],
              ['Phone', t.user.phone],
              t.order && ['Order', <Link key="o" to={`/admin/orders/${t.order.id}`} className="text-brand-700 hover:underline">{t.order.orderNumber}</Link>],
              t.shop && ['Shop', t.shop.name],
            ]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
