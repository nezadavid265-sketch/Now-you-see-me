import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, STATUS, date, dateTime, money } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { EventLog } from '../../components/OrderTimeline.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, CardHeader, DescriptionList, Input, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Modal.jsx';

const DEFAULTS = { status: '', paymentStatus: '', q: '', from: '', to: '', page: '1' };

export function AdminOrders() {
  usePageTitle('Orders');
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'orders', params], queryFn: () => api('/admin/orders', { query: params }), placeholderData: (p) => p, refetchInterval: 60_000 });
  return (
    <div>
      <PageHeader title="Orders" description="Every order across all sellers." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex gap-2 sm:col-span-2">
          <Input aria-label="Search orders" placeholder="Order number, buyer or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
        <Select aria-label="Order status" value={params.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status" options={['PENDING_PAYMENT', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'REFUNDED'].map((s) => ({ value: s, label: STATUS[s].label }))} />
        <Select aria-label="Payment status" value={params.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })} placeholder="Any payment" options={['UNPAID', 'PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'].map((s) => ({ value: s, label: STATUS[s].label }))} />
        <div className="flex gap-2">
          <Input aria-label="From date" type="date" value={params.from} onChange={(e) => update({ from: e.target.value })} />
          <Input aria-label="To date" type="date" value={params.to} onChange={(e) => update({ to: e.target.value })} />
        </div>
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
        columns={[
          { key: 'orderNumber', header: 'Order', render: (o) => <div><p className="font-semibold">{o.orderNumber}</p><p className="text-xs text-slate-500">{dateTime(o.createdAt)}</p></div> },
          { key: 'buyer', header: 'Buyer', render: (o) => <div><p>{o.buyer.name}</p><p className="text-xs text-slate-500">{o.buyer.email}</p></div> },
          { key: 'shops', header: 'Shipments', hideOnMobile: true, render: (o) => <div className="flex flex-col gap-0.5 text-xs">{o.sellerOrders.map((s) => <span key={s.id}>{s.shop.name} · <span className="text-slate-500">{STATUS[s.status]?.label}</span></span>)}</div> },
          { key: 'total', header: 'Total', render: (o) => <span className="font-semibold tabular-nums">{money(o.total)}</span> },
          { key: 'payment', header: 'Payment', render: (o) => <div className="flex flex-col gap-1"><StatusBadge status={o.paymentStatus} /><span className="text-xs text-slate-500">{PAYMENT_METHODS[o.paymentMethod]}</span></div> },
          { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
        ]}
      />
    </div>
  );
}

const OVERRIDE_TARGETS = ['ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

function OverrideModal({ shipment, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/seller-orders/${shipment.id}/status`, { method: 'POST', body: { status, reason } });
      toast.success('Shipment updated');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Change status of ${shipment.number}`} description="Use only to resolve problems. The change is recorded in the audit log." size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={status === 'CANCELLED' ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={!status || reason.trim().length < 3}>Apply</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Current status: <StatusBadge status={shipment.status} /></p>
        <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Choose…" options={OVERRIDE_TARGETS.filter((s) => s !== shipment.status).map((s) => ({ value: s, label: STATUS[s].label }))} />
        <Textarea label="Reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        {status === 'DELIVERED' && <Alert tone="warning">Confirms delivery without the buyer’s code — only do this with proof of delivery.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

export function AdminOrderDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [override, setOverride] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => api(`/admin/orders/${id}`) });
  usePageTitle(data ? `Order ${data.order.orderNumber}` : 'Order');
  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const o = data.order;
  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/admin/orders', label: 'Orders' }} title={`Order ${o.orderNumber}`} description={`Placed ${dateTime(o.createdAt)}`} actions={<><StatusBadge status={o.status} /><StatusBadge status={o.paymentStatus} /></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Summary" />
          <DescriptionList items={[
            ['Buyer', <Link key="b" to={`/admin/users/${o.buyer.id}`} className="font-semibold text-brand-700 hover:underline">{o.buyer.name}</Link>],
            ['Contact', `${o.buyer.email} · ${o.buyer.phone ?? o.shippingPhone}`],
            ['Payment', `${PAYMENT_METHODS[o.paymentMethod]}${o.paidAt ? ` · paid ${dateTime(o.paidAt)}` : ''}`],
            ['Totals', `${money(o.subtotal)} + ${money(o.deliveryFee)} delivery − ${money(o.discount)} = ${money(o.total)}`],
            ['Promo code', o.couponCode],
            ['Deliver to', `${o.shippingName}, ${[o.shippingLine1, o.shippingSector, o.shippingDistrict, o.shippingCity].filter(Boolean).join(', ')}`],
          ]} />
        </Card>
        <Card>
          <CardHeader title="Order events" />
          <EventLog events={o.events} />
        </Card>
      </div>
      {o.sellerOrders.map((s) => (
        <Card key={s.id}>
          <CardHeader
            title={`${s.number} · ${s.shop.name}`}
            description={`${s.fulfillmentMode === 'SELF' ? 'Seller delivers' : 'Rivoshoppa courier'} · commission ${money(s.commissionAmount)} · seller net ${money(s.sellerNet)}`}
            action={<div className="flex items-center gap-2"><StatusBadge status={s.status} />{!['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(s.status) && <Button size="xs" variant="outline" onClick={() => setOverride(s)}>Change status</Button>}</div>}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {s.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 p-3 text-sm">
                  <ProductImage src={i.productImage} alt="" className="size-10 rounded-md" />
                  <span className="min-w-0 flex-1 truncate">{i.productName}</span>
                  <span className="text-slate-500">×{i.quantity}</span>
                  <span className="font-semibold tabular-nums">{money(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div>
              {s.delivery && (
                <p className="mb-3 flex items-center gap-2 text-sm"><Truck className="size-4 text-brand-600" /> Delivery {STATUS[s.delivery.status]?.label ?? s.delivery.status}{s.delivery.staff && ` · ${s.delivery.staff.name} (${s.delivery.staff.phone})`}</p>
              )}
              {s.cancelReason && <Alert className="mb-3" tone="error">Cancelled by {s.cancelledBy?.toLowerCase()}: {s.cancelReason}</Alert>}
              <EventLog events={s.events} />
            </div>
          </div>
        </Card>
      ))}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payments" />
          {o.payments.length ? (
            <ul className="space-y-3 text-sm">
              {o.payments.map((p) => (
                <li key={p.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{PAYMENT_METHODS[p.provider]} · {money(p.amount, p.currency)}</span><StatusBadge status={p.status} /></div>
                  <p className="mt-1 text-xs text-slate-500">Ref {p.providerReference ?? '—'} · {dateTime(p.createdAt)}{p.failureReason && ` · ${p.failureReason}`}</p>
                  {p.events.length > 0 && <p className="mt-1 text-xs text-slate-500">{p.events.length} provider event(s) received</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No payments.</p>}
        </Card>
        <Card>
          <CardHeader title="Refunds" action={<Button size="xs" variant="ghost" to="/admin/refunds">Manage</Button>} />
          {o.refunds.length ? (
            <ul className="space-y-2 text-sm">
              {o.refunds.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{money(r.amount)} · {r.reason}</span><StatusBadge status={r.status} /></li>)}
            </ul>
          ) : <p className="text-sm text-slate-500">No refunds.</p>}
        </Card>
      </div>
      {override && <OverrideModal shipment={override} onClose={() => setOverride(null)} onDone={() => { setOverride(null); queryClient.invalidateQueries({ queryKey: ['admin', 'order', id] }); }} />}
    </div>
  );
}

function AssignModal({ delivery, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'delivery-staff'], queryFn: () => api('/admin/delivery-staff') });
  const [staffId, setStaffId] = useState(delivery.staff?.id ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/admin/deliveries/${delivery.id}/assign`, { method: 'POST', body: { staffId } });
      toast.success('Courier assigned and notified');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const active = data?.items.filter((s) => s.status === 'ACTIVE') ?? [];
  return (
    <Modal open onClose={onClose} title={`Assign courier · ${delivery.sellerOrder.number}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!staffId}>Assign</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Pickup: {delivery.sellerOrder.shop.name}{delivery.sellerOrder.shop.city && `, ${delivery.sellerOrder.shop.city}`} → {delivery.sellerOrder.order.shippingDistrict}, {delivery.sellerOrder.order.shippingCity}</p>
      {active.length ? (
        <Select label="Courier" value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Choose a courier" options={active.map((s) => ({ value: s.id, label: `${s.name} · ${s.activeDeliveries} active` }))} />
      ) : (
        <Alert tone="warning">No active couriers. <Link to="/admin/staff" className="font-semibold underline">Create a courier account</Link>.</Alert>
      )}
    </Modal>
  );
}

export function DeliveriesPage() {
  usePageTitle('Deliveries');
  const [params, update] = useListParams({ status: '', unassigned: '', page: '1' });
  const [assign, setAssign] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'deliveries', params], queryFn: () => api('/admin/deliveries', { query: params }), placeholderData: (p) => p, refetchInterval: 30_000 });
  return (
    <div>
      <PageHeader title="Deliveries" description="Shipments handled by Rivoshoppa couriers." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select aria-label="Status" value={params.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status" options={['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'].map((s) => ({ value: s, label: STATUS[s]?.label ?? s }))} className="w-48" />
        <Select aria-label="Assignment" value={params.unassigned} onChange={(e) => update({ unassigned: e.target.value })} placeholder="All" options={[{ value: 'true', label: 'Without courier' }]} className="w-48" />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        empty="No deliveries."
        columns={[
          { key: 'order', header: 'Shipment', render: (d) => <Link to={`/admin/orders/${d.sellerOrder.orderId}`} className="font-semibold text-brand-700 hover:underline">{d.sellerOrder.number}</Link> },
          { key: 'route', header: 'Route', render: (d) => <span className="text-xs">{d.sellerOrder.shop.name} → {d.sellerOrder.order.shippingDistrict}</span> },
          { key: 'collect', header: 'Collect', hideOnMobile: true, render: (d) => (d.sellerOrder.order.paymentMethod === 'CASH_ON_DELIVERY' ? <Badge tone="amber">{money(d.sellerOrder.total)} cash</Badge> : <Badge tone="green">Prepaid</Badge>) },
          { key: 'courier', header: 'Courier', render: (d) => d.staff?.name ?? <span className="font-semibold text-accent-600">Unassigned</span> },
          { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
          { key: 'updated', header: 'Updated', hideOnMobile: true, render: (d) => date(d.updatedAt) },
          { key: 'actions', header: '', render: (d) => !['DELIVERED', 'FAILED'].includes(d.status) && <Button size="xs" variant={d.staff ? 'outline' : 'primary'} onClick={() => setAssign(d)}>{d.staff ? 'Reassign' : 'Assign'}</Button> },
        ]}
      />
      {assign && <AssignModal delivery={assign} onClose={() => setAssign(null)} />}
    </div>
  );
}
