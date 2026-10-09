import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, KeyRound, MapPin, MessageSquare, Phone, RotateCcw, Star, Store, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, date, dateTime, money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { ShipmentProgress, EventLog } from '../../components/OrderTimeline.jsx';
import { TrackingMap } from '../../components/Maps.jsx';
import { NewTicketModal } from '../../components/shared/Support.jsx';
import { Alert, Badge, Button, Card, CardHeader, Input, PageHeader, PageLoader, Select, StarInput, StatusBadge, Textarea } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

function ReviewModal({ item, onClose, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/reviews', { method: 'POST', body: { orderItemId: item.id, rating, title: title || undefined, body } });
      toast.success('Thanks for your review!');
      onDone();
    } catch (err) {
      setError(err.fieldErrors?.body ?? err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Review your purchase" description={item.productName} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Submit review</Button></>}>
      <div className="space-y-4">
        <StarInput value={rating} onChange={setRating} />
        <Input label="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <Textarea label="Your review" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} placeholder="What did you like or dislike? How are you using it?" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function RefundModal({ shipment, onClose, onDone }) {
  const toast = useToast();
  const refundable = shipment.items.filter((i) => i.quantity - i.refundedQuantity > 0);
  const [qty, setQty] = useState(() => Object.fromEntries(refundable.map((i) => [i.id, 0])));
  const [reason, setReason] = useState('Item arrived damaged');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/refunds', { method: 'POST', body: { sellerOrderId: shipment.id, items, reason, details: details || undefined } });
      toast.success('Refund request sent. We’ll review it shortly.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Request a refund" description={`Shipment ${shipment.number} from ${shipment.shop.name}`} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!items.length}>Send request</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Select the items and quantities you want refunded.</p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {refundable.map((i) => (
            <li key={i.id} className="flex items-center gap-3 p-3">
              <ProductImage src={i.productImage} alt="" className="size-12 rounded-lg" />
              <p className="min-w-0 flex-1 truncate text-sm">{i.productName}</p>
              <Select aria-label={`Quantity of ${i.productName}`} value={qty[i.id]} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))} className="w-24" options={Array.from({ length: i.quantity - i.refundedQuantity + 1 }, (_, n) => ({ value: n, label: String(n) }))} />
            </li>
          ))}
        </ul>
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={['Item arrived damaged', 'Wrong item received', 'Item not as described', 'Item is defective', 'Missing parts or accessories', 'Other'].map((r) => ({ value: r, label: r }))} />
        <Textarea label="Details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} placeholder="Describe the problem. Our team may contact you for photos." />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [review, setReview] = useState(null);
  const [refund, setRefund] = useState(null);
  const [contact, setContact] = useState(null);
  const [cancel, setCancel] = useState(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api(`/orders/${id}`),
    refetchInterval: (q) => (['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(q.state.data?.order.status) ? false : 20_000),
  });
  const order = data?.order;
  usePageTitle(order ? `Order ${order.orderNumber}` : 'Order');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['order', id] });

  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;

  const cancellable = order.shipments.filter((s) => s.canCancel);
  const doCancel = async (reason) => {
    const res = await api(`/orders/${id}/cancel`, { method: 'POST', body: { reason: reason || undefined, sellerOrderId: cancel === 'all' ? undefined : cancel } });
    queryClient.setQueryData(['order', id], res);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    toast.success('Cancelled. Any payment will be refunded automatically.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/account/orders', label: 'All orders' }}
        title={`Order ${order.orderNumber}`}
        description={`Placed ${dateTime(order.createdAt)}`}
        actions={
          <>
            <StatusBadge status={order.status} />
            {order.canPay && <Button variant="accent" size="sm" icon={CreditCard} to={`/checkout/payment/${order.id}`}>Complete payment</Button>}
            {cancellable.length > 0 && order.shipments.length === cancellable.length && (
              <Button variant="danger-outline" size="sm" onClick={() => setCancel('all')}>Cancel order</Button>
            )}
          </>
        }
      />

      {order.status === 'PENDING_PAYMENT' && (
        <Alert tone="warning" title="Waiting for payment">
          Complete payment before {dateTime(order.paymentExpiresAt)} or the order will be cancelled automatically.
        </Alert>
      )}

      {order.shipments.map((s, idx) => (
        <Card key={s.id}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Shipment {idx + 1} of {order.shipments.length}</p>
              <Link to={`/shop/${s.shop.slug}`} className="mt-1 flex items-center gap-2 font-semibold hover:text-brand-700"><Store className="size-4" /> {s.shop.name}</Link>
              <p className="text-xs text-slate-500">{s.number} · {s.fulfillmentMode === 'MARKETPLACE' ? 'Delivered by Rivoshoppa' : 'Delivered by the seller'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={s.status} />
              <Button variant="ghost" size="sm" icon={MessageSquare} onClick={() => setContact(s)}>Contact seller</Button>
              {s.canCancel && order.shipments.length > 1 && <Button variant="ghost" size="sm" onClick={() => setCancel(s.id)}>Cancel</Button>}
            </div>
          </div>

          <ShipmentProgress status={s.status} events={s.events} />

          {s.deliveryCode && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 size-5 text-brand-700" />
                <div>
                  <p className="text-sm font-semibold text-brand-900">Delivery code</p>
                  <p className="text-xs text-brand-800">Share this code with the courier only after you receive your package.</p>
                </div>
              </div>
              <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-brand-900">{s.deliveryCode}</p>
            </div>
          )}

          {s.status === 'IN_TRANSIT' && (
            <div className="mt-5 space-y-3">
              {s.delivery?.courier && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <Truck className="size-4 text-brand-600" /> Your courier {s.delivery.courier.name} is on the way
                  {s.delivery.courier.phone && <a href={`tel:${s.delivery.courier.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Phone className="size-3.5" /> Call</a>}
                </p>
              )}
              {!s.delivery && s.courierName && <p className="text-sm text-slate-700">Shipped with {s.courierName}{s.trackingNumber && ` · tracking ${s.trackingNumber}`}</p>}
              <TrackingMap destination={order.shipping} courier={s.delivery?.currentLat ? { latitude: s.delivery.currentLat, longitude: s.delivery.currentLng } : null} />
            </div>
          )}
          {s.status === 'CANCELLED' && s.cancelReason && <p className="mt-3 text-sm text-slate-600">Reason: {s.cancelReason}</p>}

          <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {s.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap">
                <Link to={`/p/${i.productSlug}`}><ProductImage src={i.productImage} alt={i.productName} className="size-16 rounded-lg" /></Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/p/${i.productSlug}`} className="line-clamp-2 text-sm font-medium hover:text-brand-700">{i.productName}</Link>
                  <p className="text-xs text-slate-500">Qty {i.quantity} × {money(i.unitPrice, order.currency)}</p>
                  {i.refundedQuantity > 0 && <Badge tone="violet" className="mt-1">{i.refundedQuantity} refunded</Badge>}
                </div>
                <p className="text-sm font-semibold tabular-nums">{money(i.lineTotal, order.currency)}</p>
                {i.canReview && <Button size="sm" variant="secondary" icon={Star} onClick={() => setReview(i)}>Write a review</Button>}
                {i.review && <span className="flex items-center gap-1 text-xs text-slate-500"><Star className="size-3.5 fill-amber-400 text-amber-400" /> You rated {i.review.rating}/5</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-500">
              {s.deliveredAt ? `Delivered ${date(s.deliveredAt)}` : ''}
              {s.refundDeadline && s.canRequestRefund && ` · refunds until ${date(s.refundDeadline)}`}
            </p>
            {s.canRequestRefund && <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => setRefund(s)}>Request a refund</Button>}
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">Shipment history</summary>
            <div className="mt-3"><EventLog events={s.events} /></div>
          </details>
        </Card>
      ))}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Delivery address" />
          <div className="flex gap-3 text-sm">
            <MapPin className="size-5 shrink-0 text-brand-600" />
            <div className="text-slate-700">
              <p className="font-semibold">{order.shipping.name} · {order.shipping.phone}</p>
              <p>{[order.shipping.line1, order.shipping.line2, order.shipping.sector, order.shipping.district, order.shipping.city].filter(Boolean).join(', ')}</p>
              {order.shipping.instructions && <p className="mt-1 text-slate-500">“{order.shipping.instructions}”</p>}
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Payment" action={<StatusBadge status={order.paymentStatus} />} />
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Method</dt><dd>{PAYMENT_METHODS[order.paymentMethod]}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Items</dt><dd className="tabular-nums">{money(order.subtotal, order.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Delivery</dt><dd className="tabular-nums">{order.deliveryFee ? money(order.deliveryFee, order.currency) : 'Free'}</dd></div>
            {order.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {order.couponCode && `(${order.couponCode})`}</dt><dd className="tabular-nums">−{money(order.discount, order.currency)}</dd></div>}
            <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(order.total, order.currency)}</dd></div>
          </dl>
          {order.payments.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {order.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{PAYMENT_METHODS[p.provider]} · {dateTime(p.createdAt)}{p.failureReason && ` · ${p.failureReason}`}</span>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {order.refunds.length > 0 && (
        <Card>
          <CardHeader title="Refunds" />
          <ul className="divide-y divide-slate-100 text-sm">
            {order.refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-medium">{money(r.amount, order.currency)} · {r.reason}</p>
                  <p className="text-xs text-slate-500">{dateTime(r.createdAt)}{r.adminNote && ` · ${r.adminNote}`}</p>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {review && <ReviewModal item={review} onClose={() => setReview(null)} onDone={() => { setReview(null); refresh(); }} />}
      {refund && <RefundModal shipment={refund} onClose={() => setRefund(null)} onDone={() => { setRefund(null); refresh(); }} />}
      {contact && (
        <NewTicketModal open onClose={() => setContact(null)} basePath="/account/support" defaults={{ sellerOrderId: contact.id, type: 'ORDER', subject: `Question about ${contact.number}` }} />
      )}
      <ConfirmDialog
        open={Boolean(cancel)}
        onClose={() => setCancel(null)}
        onConfirm={doCancel}
        title={cancel === 'all' ? 'Cancel this order?' : 'Cancel this shipment?'}
        description="Items return to stock. If you already paid, the amount will be refunded to your original payment method."
        confirmLabel="Yes, cancel"
        tone="danger"
        reason
        reasonLabel="Reason (optional)"
      />
    </div>
  );
}
