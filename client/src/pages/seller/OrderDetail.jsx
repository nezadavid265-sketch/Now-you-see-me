import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MapPin, MessageSquare, Phone, Printer, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, dateTime, money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { EventLog, ShipmentProgress } from '../../components/OrderTimeline.jsx';
import { directionsLink } from '../../components/Maps.jsx';
import { Alert, Badge, Button, Card, CardHeader, Input, PageHeader, PageLoader, StatusBadge, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Modal.jsx';

function ActionModal({ action, order, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [courierName, setCourierName] = useState(order.courierName ?? '');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { status: action.status };
      if (action.requiresReason) body.reason = reason;
      if (action.requiresCode) body.deliveryCode = code;
      if (action.status === 'IN_TRANSIT') Object.assign(body, { courierName: courierName || undefined, trackingNumber: trackingNumber || undefined });
      const res = await api(`/seller/orders/${order.id}/status`, { method: 'POST', body });
      toast.success('Order updated');
      onDone(res);
    } catch (err) {
      setError(err.fieldErrors?.deliveryCode ?? err.fieldErrors?.reason ?? err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={action.label}
      description={action.help}
      size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button variant={action.danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>{action.label}</Button></>}
    >
      <div className="space-y-4">
        {action.requiresCode && (
          <Input label="Delivery code from the buyer" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputClassName="text-center font-mono text-2xl tracking-[0.4em]" placeholder="••••••" autoFocus />
        )}
        {action.requiresReason && <Textarea label={action.status === 'CANCELLED' ? 'Reason (shown to the buyer)' : 'What happened?'} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />}
        {action.status === 'IN_TRANSIT' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Courier / rider (optional)" value={courierName} onChange={(e) => setCourierName(e.target.value)} />
            <Input label="Tracking number (optional)" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          </div>
        )}
        {!action.requiresCode && !action.requiresReason && action.status !== 'IN_TRANSIT' && <p className="text-sm text-slate-600">The buyer will be notified.</p>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function RefundResponse({ refund, onDone }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/seller/refunds/${refund.id}/respond`, { method: 'POST', body: { response: text } });
      toast.success('Response sent to Rivoshoppa');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-2">
      <Textarea aria-label="Your response" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Share your side — e.g. how the item was packed or if you can offer a replacement." maxLength={1000} />
      <Button size="sm" onClick={send} loading={busy} disabled={text.trim().length < 2}>Send response</Button>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [action, setAction] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['seller', 'order', id], queryFn: () => api(`/seller/orders/${id}`), refetchInterval: 30_000 });
  const order = data?.order;
  usePageTitle(order ? `Order ${order.number}` : 'Order');
  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;

  const done = (res) => {
    queryClient.setQueryData(['seller', 'order', id], res);
    queryClient.invalidateQueries({ queryKey: ['seller', 'orders'] });
    queryClient.invalidateQueries({ queryKey: ['seller', 'dashboard'] });
    setAction(null);
  };
  const primary = order.actions.filter((a) => !a.secondary);
  const secondary = order.actions.filter((a) => a.secondary);
  const s = order.shipping;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/seller/orders', label: 'Orders' }}
        title={`Order ${order.number}`}
        description={`Received ${dateTime(order.createdAt)}`}
        actions={<><StatusBadge status={order.status} /><Button variant="outline" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button></>}
      />

      <Card>
        <ShipmentProgress status={order.status} events={order.events} />
        {order.actions.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3 rounded-xl bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-900">Next step</p>
              <p className="text-sm text-brand-800">{primary[0]?.help ?? secondary[0]?.help}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {primary.map((a) => <Button key={a.status} onClick={() => setAction(a)}>{a.label}</Button>)}
              {secondary.map((a) => <Button key={a.status} variant={a.danger ? 'danger-outline' : 'outline'} onClick={() => setAction(a)}>{a.label}</Button>)}
            </div>
          </div>
        ) : order.status === 'READY' && order.fulfillmentMode === 'MARKETPLACE' ? (
          <Alert className="mt-6" tone="info" title="Waiting for a Rivoshoppa courier">
            Keep the package ready. {order.delivery?.courier ? `${order.delivery.courier.name} (${order.delivery.courier.phone}) will collect it.` : 'A courier will be assigned shortly.'}
          </Alert>
        ) : null}
        {order.status === 'CANCELLED' && <Alert className="mt-6" tone="error" title="Order cancelled">{order.cancelReason ?? 'No reason given'} · by {order.cancelledBy?.toLowerCase()}</Alert>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-5 pb-2"><CardHeader title="Items to pack" className="mb-0" /></div>
          <ul className="divide-y divide-slate-100">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center gap-4 px-5 py-3">
                <ProductImage src={i.productImage} alt="" className="size-14 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.productName}</p>
                  <p className="text-xs text-slate-500">{i.sku && `SKU ${i.sku} · `}{money(i.unitPrice)} each</p>
                  {i.refundedQuantity > 0 && <Badge tone="violet">{i.refundedQuantity} refunded</Badge>}
                </div>
                <p className="text-lg font-bold">×{i.quantity}</p>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-slate-100 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Product sales</dt><dd className="tabular-nums">{money(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Rivoshoppa commission</dt><dd className="tabular-nums">−{money(order.commissionAmount)}</dd></div>
            {order.shopFundedDiscount > 0 && <div className="flex justify-between"><dt className="text-slate-500">Your promo discount</dt><dd className="tabular-nums">−{money(order.shopFundedDiscount)}</dd></div>}
            {order.fulfillmentMode === 'SELF' && order.deliveryFee > 0 && <div className="flex justify-between"><dt className="text-slate-500">Delivery fee (you deliver)</dt><dd className="tabular-nums">+{money(order.deliveryFee)}</dd></div>}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold"><dt>You earn</dt><dd className="tabular-nums text-emerald-700">{money(order.sellerNet)}</dd></div>
            <p className="pt-1 text-xs text-slate-500">
              Buyer pays {money(order.total)} · {PAYMENT_METHODS[order.paymentMethod]}
              {order.paymentMethod === 'CASH_ON_DELIVERY' && order.fulfillmentMode === 'SELF' && ' — collect the cash on delivery.'}
            </p>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Deliver to" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold">{s.name}</p>
              <a href={`tel:${s.phone}`} className="flex items-center gap-2 text-brand-700"><Phone className="size-4" /> {s.phone}</a>
              <p className="flex gap-2 text-slate-600"><MapPin className="mt-0.5 size-4 shrink-0" /> {[s.line1, s.line2, s.sector, s.district, s.city].filter(Boolean).join(', ')}</p>
              {s.instructions && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">“{s.instructions}”</p>}
              {s.latitude && <a href={directionsLink(s.latitude, s.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">Directions <ExternalLink className="size-3.5" /></a>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Delivery" />
            <p className="flex items-center gap-2 text-sm text-slate-700"><Truck className="size-4 text-brand-600" /> {order.fulfillmentMode === 'MARKETPLACE' ? 'Rivoshoppa courier collects from you' : 'You deliver this order'}</p>
            {order.delivery?.courier && <p className="mt-2 text-sm text-slate-600">Courier: {order.delivery.courier.name} · {order.delivery.courier.phone}</p>}
            {order.courierName && <p className="mt-2 text-sm text-slate-600">Sent with {order.courierName}{order.trackingNumber && ` (${order.trackingNumber})`}</p>}
          </Card>
          <Card>
            <CardHeader title="History" />
            <EventLog events={order.events} />
          </Card>
        </div>
      </div>

      {order.refunds.length > 0 && (
        <Card>
          <CardHeader title="Refund requests" />
          <ul className="divide-y divide-slate-100">
            {order.refunds.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{money(r.amount)} · {r.reason}</p>
                  <StatusBadge status={r.status} />
                </div>
                {r.details && <p className="mt-1 text-slate-600">“{r.details}”</p>}
                {r.sellerResponse ? (
                  <p className="mt-2 flex gap-2 rounded-lg bg-slate-50 p-2 text-slate-700"><MessageSquare className="mt-0.5 size-4 shrink-0" /> Your response: {r.sellerResponse}</p>
                ) : (
                  r.status === 'REQUESTED' && <RefundResponse refund={r} onDone={() => queryClient.invalidateQueries({ queryKey: ['seller', 'order', id] })} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {action && <ActionModal action={action} order={order} onClose={() => setAction(null)} onDone={(res) => done(res)} />}
    </div>
  );
}
