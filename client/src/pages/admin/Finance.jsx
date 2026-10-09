import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, Wallet } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, STATUS, date, dateTime, money } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, Checkbox, Input, PageHeader, Select, Stat, StatusBadge, Tabs, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Modal.jsx';

// ── Payments ───────────────────────────────────────────────────────

export function PaymentsPage() {
  usePageTitle('Payments');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, update] = useListParams({ status: '', provider: '', q: '', page: '1' });
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'payments', params], queryFn: () => api('/admin/payments', { query: params }), placeholderData: (p) => p, refetchInterval: 30_000 });
  const verify = async (p) => {
    try {
      const res = await api(`/admin/payments/${p.id}/verify`, { method: 'POST' });
      toast.info(`Provider status: ${STATUS[res.payment.status]?.label ?? res.payment.status}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div>
      <PageHeader title="Payments" description="All payment attempts. Final states are confirmed with the provider’s API, never from the browser." />
      {data?.summary && (
        <div className="mb-5 flex flex-wrap gap-2">
          {data.summary.map((s) => (
            <button key={s.status} type="button" onClick={() => update({ status: s.status })} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-left shadow-card hover:border-brand-300">
              <StatusBadge status={s.status} />
              <p className="mt-1 text-sm font-semibold tabular-nums">{s._count._all} · {money(s._sum.amount ?? 0)}</p>
            </button>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex flex-1 gap-2">
          <Input aria-label="Search payments" placeholder="Order number or provider reference" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
        <Select aria-label="Status" value={params.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status" options={['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED'].map((s) => ({ value: s, label: STATUS[s].label }))} className="sm:w-44" />
        <Select aria-label="Provider" value={params.provider} onChange={(e) => update({ provider: e.target.value })} placeholder="Any method" options={Object.entries(PAYMENT_METHODS).filter(([k]) => k !== 'BANK_TRANSFER').map(([value, label]) => ({ value, label }))} className="sm:w-52" />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        columns={[
          { key: 'createdAt', header: 'Created', render: (p) => dateTime(p.createdAt) },
          { key: 'order', header: 'Order', render: (p) => <Link to={`/admin/orders/${p.order.id}`} className="font-semibold text-brand-700 hover:underline">{p.order.orderNumber}</Link> },
          { key: 'provider', header: 'Method', render: (p) => <div><p>{PAYMENT_METHODS[p.provider]}</p><p className="max-w-[180px] truncate text-xs text-slate-500" title={p.providerReference}>{p.providerReference ?? '—'}</p></div> },
          { key: 'amount', header: 'Amount', render: (p) => <span className="font-semibold tabular-nums">{money(p.amount, p.currency)}</span> },
          { key: 'status', header: 'Status', render: (p) => <div><StatusBadge status={p.status} />{p.failureReason && <p className="mt-1 max-w-[200px] text-xs text-slate-500">{p.failureReason}</p>}</div> },
          { key: 'actions', header: '', render: (p) => ['MTN_MOMO', 'AIRTEL_MONEY'].includes(p.provider) && !p.providerFinal && <Button size="xs" variant="outline" icon={RefreshCw} onClick={() => verify(p)}>Check now</Button> },
        ]}
      />
    </div>
  );
}

// ── Refunds ────────────────────────────────────────────────────────

function RefundActionModal({ refund, kind, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = kind === 'approve' ? { note: note || undefined, restock } : kind === 'reject' ? { note } : { reference, note: note || undefined };
      await api(`/admin/refunds/${refund.id}/${kind}`, { method: 'POST', body });
      toast.success('Refund updated');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const titles = { approve: 'Approve refund', reject: 'Reject refund', complete: 'Mark refund as sent' };
  return (
    <Modal open onClose={onClose} title={titles[kind]} description={`${money(refund.amount)} to ${refund.buyer.name} · order ${refund.order.orderNumber}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={kind === 'reject' ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={(kind === 'reject' && note.trim().length < 3) || (kind === 'complete' && reference.trim().length < 2)}>{titles[kind]}</Button></>}>
      <div className="space-y-4">
        {refund.details && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Buyer: “{refund.details}”</p>}
        {refund.sellerResponse && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">Seller: “{refund.sellerResponse}”</p>}
        {kind === 'complete' && (
          <>
            <Alert tone="info">Send {money(refund.amount)} to the buyer ({refund.order.paymentMethod === 'CASH_ON_DELIVERY' ? 'cash/mobile money' : PAYMENT_METHODS[refund.order.paymentMethod]}{refund.buyer.phone && ` · ${refund.buyer.phone}`}), then record the transaction reference.</Alert>
            <Input label="Transaction reference" required value={reference} onChange={(e) => setReference(e.target.value)} />
          </>
        )}
        {kind === 'approve' && <Checkbox label="Return the items to the seller’s stock" checked={restock} onChange={(e) => setRestock(e.target.checked)} />}
        <Textarea label={kind === 'reject' ? 'Reason (shared with the buyer)' : 'Note (optional)'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

export function RefundsPage() {
  usePageTitle('Refunds');
  const [params, update] = useListParams({ status: 'REQUESTED', page: '1' });
  const [action, setAction] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'refunds', params], queryFn: () => api('/admin/refunds', { query: { ...params, status: params.status === 'ALL' ? undefined : params.status } }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Refunds" description="Review buyer requests, then send the money back and record the reference." />
      <Tabs className="mb-4" value={params.status} onChange={(status) => update({ status })} tabs={[
        { value: 'REQUESTED', label: 'To review' },
        { value: 'APPROVED', label: 'Approved — send money' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'REJECTED', label: 'Rejected' },
        { value: 'ALL', label: 'All' },
      ]} />
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        empty="Nothing here."
        columns={[
          { key: 'createdAt', header: 'Requested', render: (r) => date(r.createdAt) },
          { key: 'order', header: 'Order', render: (r) => <div><Link to={`/admin/orders/${r.order.id}`} className="font-semibold text-brand-700 hover:underline">{r.order.orderNumber}</Link><p className="text-xs text-slate-500">{r.sellerOrder?.shop.name ?? 'Payment-level refund'}</p></div> },
          { key: 'buyer', header: 'Buyer', hideOnMobile: true, render: (r) => <div className="text-xs"><p className="text-sm">{r.buyer.name}</p><p className="text-slate-500">{r.buyer.phone ?? r.buyer.email}</p></div> },
          { key: 'reason', header: 'Reason', render: (r) => <div className="max-w-xs"><p>{r.reason}</p>{r.items.length > 0 && <p className="text-xs text-slate-500">{r.items.map((i) => `${i.quantity}× ${i.orderItem.productName}`).join(', ')}</p>}{r.isAutomatic && <Badge tone="violet">Automatic</Badge>}</div> },
          { key: 'amount', header: 'Amount', render: (r) => <span className="font-semibold tabular-nums">{money(r.amount)}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex flex-wrap gap-1.5">
                {r.status === 'REQUESTED' && <><Button size="xs" onClick={() => setAction({ refund: r, kind: 'approve' })}>Approve</Button><Button size="xs" variant="danger-outline" onClick={() => setAction({ refund: r, kind: 'reject' })}>Reject</Button></>}
                {r.status === 'APPROVED' && <Button size="xs" onClick={() => setAction({ refund: r, kind: 'complete' })}>Mark as sent</Button>}
              </div>
            ),
          },
        ]}
      />
      {action && <RefundActionModal {...action} onClose={() => setAction(null)} />}
    </div>
  );
}

// ── Payouts, balances & commissions ────────────────────────────────

function PayoutModal({ shop, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(shop.available));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/admin/payouts', { method: 'POST', body: { shopId: shop.id, amount: Number(amount), note: note || undefined } });
      toast.success('Payout created — send the money, then mark it as paid.');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Pay out ${shop.name}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Create payout</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Available: <span className="font-semibold">{money(shop.available)}</span>. Account: {shop.payoutAccount?.payoutAccountNumber ? `${PAYMENT_METHODS[shop.payoutAccount.payoutMethod]} · ${shop.payoutAccount.payoutAccountName} · ${shop.payoutAccount.payoutAccountNumber}` : 'not provided'}</p>
        <Input label="Amount (RWF)" type="number" min={1} max={shop.available} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function PaidModal({ payout, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/admin/payouts/${payout.id}/paid`, { method: 'POST', body: { reference } });
      toast.success('Payout marked as paid; the seller was notified');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Confirm payout sent" description={`${money(payout.amount)} to ${payout.shop.name} · ${PAYMENT_METHODS[payout.method]} ${payout.accountNumber ?? ''}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={reference.trim().length < 2}>Mark as paid</Button></>}>
      <Input label="Transaction reference" required value={reference} onChange={(e) => setReference(e.target.value)} />
    </Modal>
  );
}

export function PayoutsPage() {
  usePageTitle('Payouts & commissions');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('balances');
  const [page, setPage] = useState(1);
  const [payFor, setPayFor] = useState(null);
  const [markPaid, setMarkPaid] = useState(null);
  const summary = useQuery({ queryKey: ['admin', 'finance', 'summary'], queryFn: () => api('/admin/finance/summary') });
  const balances = useQuery({ queryKey: ['admin', 'finance', 'balances', page], queryFn: () => api('/admin/finance/balances', { query: { page } }), enabled: tab === 'balances' });
  const payouts = useQuery({ queryKey: ['admin', 'payouts', page], queryFn: () => api('/admin/payouts', { query: { page } }), enabled: tab === 'payouts' });
  const commissions = useQuery({ queryKey: ['admin', 'finance', 'commissions', page], queryFn: () => api('/admin/finance/commissions', { query: { page } }), enabled: tab === 'commissions' });
  const s = summary.data;
  const cancel = async (p) => {
    try {
      await api(`/admin/payouts/${p.id}/cancel`, { method: 'POST', body: { note: 'Cancelled by administrator' } });
      toast.success('Payout cancelled; balance returned to the seller');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Payouts & commissions" description="Seller balances come from an append-only ledger of earnings, refunds and payouts." />
      {s && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Gross sales" value={money(s.grossSales)} hint={`${s.orders} shipments`} />
          <Stat label="Commission earned" value={money(s.commissionEarned)} hint="Delivered orders" tone="green" />
          <Stat label="Owed to sellers" value={money(s.owedToSellers)} hint={`${money(s.pendingPayouts)} in pending payouts`} tone="amber" icon={Wallet} />
          <Stat label="Paid out / refunded" value={money(s.paidOut)} hint={`${money(s.refundsCompleted)} refunded to buyers`} tone="violet" />
        </div>
      )}
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ value: 'balances', label: 'Seller balances' }, { value: 'payouts', label: 'Payouts' }, { value: 'commissions', label: 'Commission report' }]} />
      {tab === 'balances' && (
        <DataTable
          loading={balances.isLoading}
          rows={balances.data?.items}
          pagination={balances.data?.pagination}
          onPageChange={setPage}
          columns={[
            { key: 'name', header: 'Shop', render: (b) => <span className="font-medium">{b.name}</span> },
            { key: 'available', header: 'Available', render: (b) => <span className={`font-semibold tabular-nums ${b.available < 0 ? 'text-red-600' : ''}`}>{money(b.available)}</span> },
            { key: 'pending', header: 'On hold', render: (b) => <span className="tabular-nums">{money(b.pending)}</span> },
            { key: 'account', header: 'Payout account', hideOnMobile: true, render: (b) => (b.payoutAccount?.payoutAccountNumber ? <span className="text-xs">{PAYMENT_METHODS[b.payoutAccount.payoutMethod]} · {b.payoutAccount.payoutAccountNumber}</span> : <span className="text-xs text-amber-700">Missing</span>) },
            { key: 'actions', header: '', render: (b) => b.available > 0 && <Button size="xs" onClick={() => setPayFor(b)}>Pay out</Button> },
          ]}
        />
      )}
      {tab === 'payouts' && (
        <DataTable
          loading={payouts.isLoading}
          rows={payouts.data?.items}
          pagination={payouts.data?.pagination}
          onPageChange={setPage}
          empty="No payouts yet."
          columns={[
            { key: 'createdAt', header: 'Created', render: (p) => date(p.createdAt) },
            { key: 'shop', header: 'Shop', render: (p) => p.shop.name },
            { key: 'amount', header: 'Amount', render: (p) => <span className="font-semibold tabular-nums">{money(p.amount)}</span> },
            { key: 'to', header: 'To', hideOnMobile: true, render: (p) => <span className="text-xs">{PAYMENT_METHODS[p.method]} · {p.accountName} · {p.accountNumber}</span> },
            { key: 'status', header: 'Status', render: (p) => <div><StatusBadge status={p.status} />{p.reference && <p className="text-xs text-slate-500">Ref {p.reference}</p>}</div> },
            { key: 'actions', header: '', render: (p) => p.status === 'PENDING' && <div className="flex gap-1.5"><Button size="xs" onClick={() => setMarkPaid(p)}>Mark paid</Button><Button size="xs" variant="ghost" onClick={() => cancel(p)}>Cancel</Button></div> },
          ]}
        />
      )}
      {tab === 'commissions' && (
        <>
          {commissions.data && <Card className="flex flex-wrap gap-6 text-sm"><span>Sales: <b className="tabular-nums">{money(commissions.data.totals.sales)}</b></span><span>Commission: <b className="tabular-nums text-emerald-700">{money(commissions.data.totals.commission)}</b></span></Card>}
          <DataTable
            className="mt-4"
            loading={commissions.isLoading}
            rows={commissions.data?.items}
            pagination={commissions.data?.pagination}
            onPageChange={setPage}
            empty="No delivered orders yet."
            columns={[
              { key: 'deliveredAt', header: 'Delivered', render: (c) => date(c.deliveredAt) },
              { key: 'number', header: 'Shipment' },
              { key: 'shop', header: 'Shop', render: (c) => c.shop.name },
              { key: 'subtotal', header: 'Sales', render: (c) => money(c.subtotal) },
              { key: 'commissionAmount', header: 'Commission', render: (c) => <span className="font-semibold text-emerald-700">{money(c.commissionAmount)}</span> },
              { key: 'sellerNet', header: 'Seller net', render: (c) => money(c.sellerNet) },
            ]}
          />
        </>
      )}
      {payFor && <PayoutModal shop={payFor} onClose={() => setPayFor(null)} />}
      {markPaid && <PaidModal payout={markPaid} onClose={() => setMarkPaid(null)} />}
    </div>
  );
}
