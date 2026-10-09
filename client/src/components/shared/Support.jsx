import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, MessageSquare, Plus, Send } from 'lucide-react';
import { api } from '../../lib/api.js';
import { dateTime, timeAgo, titleCase } from '../../lib/format.js';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Pagination, Select, StatusBadge, Textarea, cx } from '../ui/index.jsx';
import { Modal } from '../ui/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const TYPES = [
  { value: 'GENERAL', label: 'General question' },
  { value: 'ORDER', label: 'Problem with an order' },
  { value: 'PAYMENT', label: 'Payment issue' },
  { value: 'DELIVERY', label: 'Delivery issue' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'COMPLAINT', label: 'Complaint' },
  { value: 'DISPUTE', label: 'Dispute with a seller' },
];
const SELLER_TYPES = [{ value: 'SELLER_ACCOUNT', label: 'My seller account' }, ...TYPES.filter((t) => ['GENERAL', 'PAYMENT', 'ORDER', 'COMPLAINT'].includes(t.value))];

export function NewTicketModal({ open, onClose, basePath, seller = false, defaults = {} }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm({ type: defaults.type ?? (seller ? 'SELLER_ACCOUNT' : 'GENERAL'), subject: defaults.subject ?? '', message: '' });
  const onSubmit = form.submit(async (values) => {
    const { ticket } = await api('/support/tickets', { method: 'POST', body: { ...values, orderId: defaults.orderId, sellerOrderId: defaults.sellerOrderId } });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    onClose();
    navigate(`${basePath}/${ticket.id}`);
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={defaults.sellerOrderId ? 'Contact the seller' : 'New support request'}
      description={defaults.sellerOrderId ? 'Your message goes to the seller and Rivoshoppa support.' : 'Our team usually replies within one business day.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={form.submitting} icon={Send}>
            Send
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        {!defaults.sellerOrderId && <Select label="Topic" options={seller ? SELLER_TYPES : TYPES} {...form.field('type')} />}
        <Input label="Subject" required maxLength={150} {...form.field('subject')} />
        <Textarea label="How can we help?" required rows={5} maxLength={4000} placeholder="Describe the issue with as much detail as possible." {...form.field('message')} />
      </form>
    </Modal>
  );
}

export function TicketList({ basePath, seller = false }) {
  usePageTitle('Support');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['tickets', page], queryFn: () => api('/support/tickets', { query: { page } }) });
  return (
    <div>
      <PageHeader
        title={seller ? 'Support & customer requests' : 'Help & support'}
        description={seller ? 'Questions from your customers and conversations with Rivoshoppa support.' : 'Get help with orders, payments and deliveries.'}
        actions={
          <Button icon={Plus} onClick={() => setOpen(true)}>
            New request
          </Button>
        }
      />
      {isLoading ? (
        <PageLoader />
      ) : !data?.items.length ? (
        <EmptyState icon={LifeBuoy} title="No support requests yet" description="Need help? Open a request and our team will get back to you." action={<Button onClick={() => setOpen(true)}>Contact support</Button>} />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {data.items.map((t) => (
              <li key={t.id}>
                <Link to={`${basePath}/${t.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50">
                  <MessageSquare className="mt-0.5 size-5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.number} · {titleCase(t.type)}
                      {t.orderNumber && ` · Order ${t.orderNumber}`}
                      {seller && t.createdBy !== 'You' && ` · from ${t.createdBy}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={t.status} label={t.status === 'IN_PROGRESS' ? 'In progress' : undefined} />
                    <span className="text-xs text-slate-400">{timeAgo(t.lastReplyAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination pagination={data?.pagination} onChange={setPage} />
      <NewTicketModal open={open} onClose={() => setOpen(false)} basePath={basePath} seller={seller} />
    </div>
  );
}

export function TicketThread({ basePath }) {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['tickets', id], queryFn: () => api(`/support/tickets/${id}`), refetchInterval: 20_000 });
  usePageTitle(data?.ticket?.subject ?? 'Support');
  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const t = data.ticket;

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await api(`/support/tickets/${id}/messages`, { method: 'POST', body: { body: reply.trim() } });
      queryClient.setQueryData(['tickets', id], res);
      setReply('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };
  const close = async () => {
    const res = await api(`/support/tickets/${id}/close`, { method: 'POST' });
    queryClient.setQueryData(['tickets', id], res);
    toast.success('Conversation closed');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: basePath, label: 'All requests' }}
        title={t.subject}
        description={`${t.number} · ${titleCase(t.type)}${t.order ? ` · Order ${t.order.orderNumber}` : ''}${t.shop ? ` · ${t.shop.name}` : ''}`}
        actions={
          <>
            <StatusBadge status={t.status} label={t.status === 'IN_PROGRESS' ? 'In progress' : undefined} />
            {t.isOwner && t.status !== 'CLOSED' && (
              <Button variant="outline" size="sm" onClick={close}>
                Close conversation
              </Button>
            )}
          </>
        }
      />
      <Card>
        <ol className="space-y-4">
          {t.messages.map((m) => (
            <li key={m.id} className={cx('flex', m.mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[85%] rounded-2xl px-4 py-3', m.mine ? 'rounded-br-sm bg-brand-700 text-white' : 'rounded-bl-sm bg-slate-100 text-slate-800')}>
                <p className={cx('mb-1 flex items-center gap-2 text-xs font-semibold', m.mine ? 'text-brand-100' : 'text-slate-500')}>
                  {m.mine ? 'You' : m.author}
                  {m.authorRole === 'ADMIN' && !m.mine && <Badge tone="brand">Staff</Badge>}
                </p>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className={cx('mt-1 text-[11px]', m.mine ? 'text-brand-100' : 'text-slate-400')}>{dateTime(m.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
        {t.status !== 'CLOSED' ? (
          <form onSubmit={send} className="mt-6 border-t border-slate-100 pt-4">
            <Textarea label="Your reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} />
            <div className="mt-3 flex justify-end">
              <Button type="submit" loading={sending} icon={Send} disabled={!reply.trim()}>
                Send reply
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-6 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">This conversation is closed.</p>
        )}
      </Card>
    </div>
  );
}
