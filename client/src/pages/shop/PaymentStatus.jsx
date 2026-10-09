import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Clock, Smartphone } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useConfig } from '../../context/ConfigContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Alert, Button, Card, Input, PageLoader, Spinner, cx } from '../../components/ui/index.jsx';

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return <span className="font-semibold tabular-nums">{left ? `${m}:${String(s).padStart(2, '0')}` : 'expired'}</span>;
}

function RetryForm({ order, onStarted }) {
  const { user } = useAuth();
  const config = useConfig();
  const toast = useToast();
  const methods = config.paymentMethods.filter((m) => !(m.method === 'CASH_ON_DELIVERY' && m.maxTotal && order.total > m.maxTotal));
  const [method, setMethod] = useState(methods.find((m) => m.method !== 'CASH_ON_DELIVERY')?.method ?? methods[0]?.method);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [busy, setBusy] = useState(false);
  const selected = methods.find((m) => m.method === method);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api(`/orders/${order.id}/pay`, { method: 'POST', body: { paymentMethod: method, payerPhone: selected?.requiresPhone ? phone : undefined } });
      onStarted(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {methods.map((m) => (
          <label key={m.method} className={cx('cursor-pointer rounded-lg border-2 p-3 text-sm font-medium', method === m.method ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200')}>
            <input type="radio" className="mr-2 accent-brand-700" checked={method === m.method} onChange={() => setMethod(m.method)} />
            {m.label}
          </label>
        ))}
      </div>
      {selected?.requiresPhone && <Input label="Mobile money number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />}
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={busy}>
        {method === 'CASH_ON_DELIVERY' ? 'Switch to cash on delivery' : `Pay ${money(order.total, order.currency)}`}
      </Button>
    </form>
  );
}

export default function PaymentStatus() {
  usePageTitle('Payment');
  const { orderId } = useParams();
  const [params, setParams] = useSearchParams();
  const paymentId = params.get('payment');
  const config = useConfig();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [simulating, setSimulating] = useState(false);

  const orderQuery = useQuery({ queryKey: ['order', orderId], queryFn: () => api(`/orders/${orderId}`), refetchInterval: (q) => (q.state.data?.order.status === 'PENDING_PAYMENT' ? 5000 : false) });
  const paymentQuery = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => api(`/payments/${paymentId}`),
    enabled: Boolean(paymentId),
    refetchInterval: (q) => (q.state.data?.payment.status === 'PENDING' ? 3000 : false),
  });

  const payment = paymentQuery.data?.payment;
  const order = orderQuery.data?.order;
  const paid = order && order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED';
  useEffect(() => {
    if (paid) queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [paid, queryClient]);
  useEffect(() => {
    if (payment && payment.status !== 'PENDING') orderQuery.refetch();
  }, [payment?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (orderQuery.isLoading) return <PageLoader />;
  if (orderQuery.error) return <div className="container-page py-12"><Alert tone="error">{orderQuery.error.message}</Alert></div>;

  const simulate = async (outcome) => {
    setSimulating(true);
    try {
      await api(`/payments/${paymentId}/simulate`, { method: 'POST', body: { outcome } });
      await Promise.all([paymentQuery.refetch(), orderQuery.refetch()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSimulating(false);
    }
  };

  const started = (res) => {
    queryClient.setQueryData(['order', orderId], { order: res.order });
    if (res.payment) setParams({ payment: res.payment.id }, { replace: true });
  };

  let body;
  if (paid) {
    body = (
      <div className="text-center">
        <CircleCheck className="mx-auto size-16 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold">{order.paymentMethod === 'CASH_ON_DELIVERY' ? 'Order confirmed!' : 'Payment received — thank you!'}</h1>
        <p className="mt-2 text-slate-600">Order <span className="font-semibold">{order.orderNumber}</span> is confirmed. We’ll notify you as your sellers prepare and ship it.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button to={`/account/orders/${order.id}`}>View order</Button>
          <Button variant="outline" to="/">Continue shopping</Button>
        </div>
      </div>
    );
  } else if (order.status === 'CANCELLED') {
    body = (
      <div className="text-center">
        <CircleX className="mx-auto size-16 text-red-500" />
        <h1 className="mt-4 text-2xl font-bold">This order was cancelled</h1>
        <p className="mt-2 text-slate-600">{order.cancelReason ?? 'Payment was not completed in time.'} Items have been returned to stock — you can order them again.</p>
        <Button className="mt-6" to="/cart">Back to cart</Button>
      </div>
    );
  } else if (payment?.status === 'PENDING') {
    body = (
      <div className="text-center">
        <div className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-brand-50">
          <Smartphone className="size-9 text-brand-700" />
          <Spinner className="absolute -right-1 -bottom-1 size-7 rounded-full bg-white p-1" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">Approve the payment on your phone</h1>
        <p className="mt-2 text-slate-600">
          We sent a request for <span className="font-semibold">{money(payment.amount, payment.currency)}</span> to {payment.payerPhone ?? 'your phone'}. Enter your PIN to confirm.
        </p>
        <p className="mt-1 text-sm text-slate-500">This page updates automatically. Don’t see a prompt? MTN users can dial *182*7*1# to view pending approvals.</p>
        {order.paymentExpiresAt && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">
            <Clock className="size-4" /> Items reserved for <Countdown until={order.paymentExpiresAt} />
          </p>
        )}
        {payment.provider === 'TEST' && config.paymentTestMode && (
          <div className="mt-6 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4">
            <p className="text-sm font-semibold text-violet-900">Sandbox mode — simulate the customer’s phone</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button size="sm" onClick={() => simulate('success')} loading={simulating}>Approve payment</Button>
              <Button size="sm" variant="danger-outline" onClick={() => simulate('failure')} disabled={simulating}>Decline</Button>
            </div>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-500">
          Changed your mind about how to pay? <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setParams({}, { replace: true })}>Choose another method</button>
        </p>
      </div>
    );
  } else {
    body = (
      <div>
        <div className="text-center">
          {payment?.status === 'FAILED' || payment?.status === 'EXPIRED' ? <CircleX className="mx-auto size-14 text-red-500" /> : <Smartphone className="mx-auto size-14 text-brand-600" />}
          <h1 className="mt-4 text-2xl font-bold">{payment ? 'Payment not completed' : 'Complete your payment'}</h1>
          <p className="mt-2 text-slate-600">{payment?.failureReason ?? `Order ${order.orderNumber} is waiting for payment.`}</p>
          {order.paymentExpiresAt && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">
              <Clock className="size-4" /> Your items are reserved for <Countdown until={order.paymentExpiresAt} />
            </p>
          )}
        </div>
        {order.canPay ? <div className="mx-auto mt-6 max-w-md"><RetryForm order={order} onStarted={started} /></div> : <Alert className="mt-6" tone="warning">The payment window has closed.</Alert>}
      </div>
    );
  }

  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="p-8">{body}</Card>
      <p className="mt-4 text-center text-sm text-slate-500">
        Order total {money(order.total, order.currency)} · <Link to={`/account/orders/${order.id}`} className="font-semibold text-brand-700 hover:underline">Order details</Link>
      </p>
    </div>
  );
}
