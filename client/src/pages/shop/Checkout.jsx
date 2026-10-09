import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CircleCheck, Lock, MapPin, Plus, Smartphone, Store, Tag, TestTube2, TriangleAlert, Truck, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { AddressForm } from '../../components/shared/AddressForm.jsx';
import { Alert, Button, Card, EmptyState, Input, PageLoader, Spinner, cx } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Modal.jsx';

const METHOD_ICONS = { MTN_MOMO: Smartphone, AIRTEL_MONEY: Smartphone, CASH_ON_DELIVERY: Banknote, TEST: TestTube2 };
const METHOD_HELP = {
  MTN_MOMO: 'You will receive a prompt on your phone to approve the payment with your MoMo PIN.',
  AIRTEL_MONEY: 'You will receive a prompt on your phone to approve the payment with your Airtel Money PIN.',
  CASH_ON_DELIVERY: 'Pay the courier in cash when your order arrives.',
  TEST: 'Sandbox payment for testing — no real money moves.',
};

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Section({ step, title, children, action }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-base font-semibold">
          <span className="flex size-7 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{step}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function Checkout() {
  usePageTitle('Checkout');
  const { user } = useAuth();
  const { refresh: refreshCart } = useCart();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [addressId, setAddressId] = useState(null);
  const [method, setMethod] = useState(null);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [addressModal, setAddressModal] = useState(false);
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt: a double click or network retry can never create two orders.
  const idempotencyKey = useMemo(() => newKey(), []);

  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => api('/account/addresses') });
  const quote = useQuery({
    queryKey: ['checkout-quote', coupon],
    queryFn: () => api('/checkout/quote', { method: 'POST', body: { couponCode: coupon || undefined } }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!addressId && addresses.data?.items.length) setAddressId((addresses.data.items.find((a) => a.isDefault) ?? addresses.data.items[0]).id);
  }, [addresses.data, addressId]);

  const methods = useMemo(() => quote.data?.paymentMethods ?? [], [quote.data]);
  useEffect(() => {
    if (!method && methods.length) setMethod(methods[0].method);
  }, [methods, method]);

  if (quote.isLoading || addresses.isLoading) return <PageLoader label="Preparing checkout…" />;
  const q = quote.data;
  if (!q?.groups?.length) {
    return (
      <div className="container-page py-12">
        <EmptyState title="Your cart is empty" description="Add some products before checking out." action={<Button to="/">Continue shopping</Button>} />
      </div>
    );
  }

  const selectedMethod = methods.find((m) => m.method === method);
  const codTooLarge = (m) => m.method === 'CASH_ON_DELIVERY' && m.maxTotal && q.total > m.maxTotal;
  const blocking = q.problems.length > 0 || problems?.length > 0;

  const applyCoupon = (e) => {
    e.preventDefault();
    setCoupon(couponInput.trim().toUpperCase());
  };

  const placeOrder = async () => {
    setError('');
    setProblems(null);
    if (!addressId) return setError('Choose a delivery address.');
    if (!selectedMethod) return setError('Choose a payment method.');
    if (selectedMethod.requiresPhone && !phone.trim()) return setError('Enter the mobile money number to charge.');
    setSubmitting(true);
    try {
      const res = await api('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: { addressId, paymentMethod: method, payerPhone: selectedMethod.requiresPhone ? phone.trim() : undefined, couponCode: q.coupon?.code },
      });
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      refreshCart();
      if (res.payment) navigate(`/checkout/payment/${res.order.id}?payment=${res.payment.id}`, { replace: true });
      else navigate(`/checkout/success/${res.order.id}`, { replace: true });
    } catch (err) {
      if (err.code === 'CART_PROBLEMS') {
        setProblems(err.details?.problems ?? []);
        quote.refetch();
      }
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
        <span className="flex items-center gap-1.5 text-sm text-slate-500"><Lock className="size-4" /> Secure checkout</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Section
            step={1}
            title="Delivery address"
            action={<Button variant="ghost" size="sm" icon={Plus} onClick={() => setAddressModal(true)}>Add address</Button>}
          >
            {addresses.data.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.data.items.map((a) => (
                  <label key={a.id} className={cx('cursor-pointer rounded-xl border-2 p-4 transition-colors', addressId === a.id ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300')}>
                    <input type="radio" name="address" className="sr-only" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <MapPin className="size-4 text-brand-600" /> {a.label} {a.isDefault && <span className="text-xs font-medium text-slate-500">(default)</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{a.recipientName} · {a.phone}</p>
                    <p className="text-sm text-slate-500">{[a.line1, a.line2, a.sector, a.district, a.city].filter(Boolean).join(', ')}</p>
                  </label>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm text-slate-600">Add a delivery address to continue.</p>
                <Button className="mt-3" icon={Plus} onClick={() => setAddressModal(true)}>Add address</Button>
              </div>
            )}
          </Section>

          <Section step={2} title="Payment method">
            {methods.length === 0 ? (
              <Alert tone="warning">No payment methods are available right now. Please try again later.</Alert>
            ) : (
              <div className="space-y-3">
                {methods.map((m) => {
                  const Icon = METHOD_ICONS[m.method] ?? Smartphone;
                  const disabled = codTooLarge(m);
                  return (
                    <label key={m.method} className={cx('flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition-colors', disabled && 'cursor-not-allowed opacity-60', method === m.method ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300')}>
                      <input type="radio" name="method" className="mt-1 accent-brand-700" disabled={disabled} checked={method === m.method} onChange={() => setMethod(m.method)} />
                      <Icon className="mt-0.5 size-5 shrink-0 text-brand-700" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{m.label}</p>
                        <p className="text-xs text-slate-500">{disabled ? `Available for orders up to ${money(m.maxTotal)}.` : METHOD_HELP[m.method]}</p>
                        {method === m.method && m.requiresPhone && (
                          <Input className="mt-3 max-w-xs" label="Mobile money number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" required />
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </Section>

          <Section step={3} title="Review your items">
            <div className="space-y-5">
              {q.groups.map((g, i) => (
                <div key={g.shop.id}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><Store className="size-4" /> Shipment {i + 1} from {g.shop.name}</p>
                    <p className="flex items-center gap-1.5 text-slate-500"><Truck className="size-4" /> {g.deliveryFee ? money(g.deliveryFee) : 'Free delivery'} · {g.fulfillmentMode === 'MARKETPLACE' ? 'Rivoshoppa courier' : 'Seller delivery'}</p>
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {g.items.map((it) => (
                      <li key={it.productId} className="flex items-center gap-3 p-3">
                        <ProductImage src={it.image} alt="" className="size-14 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{it.name}</p>
                          <p className="text-xs text-slate-500">Qty {it.quantity} × {money(it.unitPrice)}</p>
                          {!it.available && <p className="text-xs font-semibold text-red-600">{it.reason}</p>}
                        </div>
                        <p className="text-sm font-semibold tabular-nums">{money(it.lineTotal)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <Card>
            <h2 className="text-lg font-semibold">Order summary</h2>
            <form onSubmit={applyCoupon} className="mt-4 flex gap-2">
              <Input aria-label="Promo code" placeholder="Promo code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} className="flex-1" inputClassName="uppercase" />
              <Button type="submit" variant="outline" icon={Tag} disabled={!couponInput.trim()}>Apply</Button>
            </form>
            {q.couponError && coupon && <p className="mt-2 text-sm text-red-600">{q.couponError}</p>}
            {q.coupon && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span className="flex items-center gap-1.5"><CircleCheck className="size-4" /> {q.coupon.code} applied</span>
                <button type="button" onClick={() => { setCoupon(''); setCouponInput(''); }} aria-label="Remove promo code"><X className="size-4" /></button>
              </div>
            )}
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Items ({q.itemCount})</dt><dd className="tabular-nums">{money(q.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Delivery</dt><dd className="tabular-nums">{q.deliveryFee ? money(q.deliveryFee) : 'Free'}</dd></div>
              {q.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd className="tabular-nums">−{money(q.discount)}</dd></div>}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base"><dt className="font-semibold">Total to pay</dt><dd className="font-extrabold tabular-nums">{money(q.total)}</dd></div>
            </dl>
            {quote.isFetching && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Spinner className="size-3" /> Updating prices…</p>}
            {(problems?.length || q.problems.length > 0) && (
              <Alert className="mt-4" tone="warning" title="Your cart changed">
                <ul className="list-disc pl-4">
                  {(problems ?? q.problems).map((p, i) => <li key={i}>{p.name}: {p.reason}</li>)}
                </ul>
                <Link to="/cart" className="mt-1 inline-block font-semibold underline">Review cart</Link>
              </Alert>
            )}
            {error && !problems && <Alert className="mt-4" tone="error">{error}</Alert>}
            <Button size="lg" variant="accent" className="mt-5 w-full" loading={submitting} disabled={blocking || !methods.length} onClick={placeOrder}>
              {selectedMethod?.method === 'CASH_ON_DELIVERY' ? 'Place order' : `Pay ${money(q.total)}`}
            </Button>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> Prices, delivery fees and discounts are verified again when you place the order.
            </p>
          </Card>
        </aside>
      </div>

      <Modal open={addressModal} onClose={() => setAddressModal(false)} title="New delivery address" size="lg">
        <AddressForm
          defaultName={user.name}
          defaultPhone={user.phone ?? ''}
          onCancel={() => setAddressModal(false)}
          onSaved={(a) => {
            queryClient.invalidateQueries({ queryKey: ['addresses'] });
            setAddressId(a.id);
            setAddressModal(false);
          }}
        />
      </Modal>
    </div>
  );
}
