import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, KeyRound, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { Alert, Button, Card, PageLoader } from '../../components/ui/index.jsx';

export default function OrderSuccess() {
  usePageTitle('Order confirmed');
  const { orderId } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['order', orderId], queryFn: () => api(`/orders/${orderId}`) });
  if (isLoading) return <PageLoader />;
  if (error) return <div className="container-page py-12"><Alert tone="error">{error.message}</Alert></div>;
  const order = data.order;
  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="p-8 text-center">
        <CircleCheck className="mx-auto size-16 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold">Thank you — your order is confirmed!</h1>
        <p className="mt-2 text-slate-600">
          Order <span className="font-semibold">{order.orderNumber}</span> · {money(order.total, order.currency)}
          {order.paymentMethod === 'CASH_ON_DELIVERY' && ' · pay in cash on delivery'}
        </p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl bg-slate-50 p-4">
            <Truck className="size-5 shrink-0 text-brand-600" />
            <p className="text-sm text-slate-600">
              Your order ships in <span className="font-semibold">{order.shipments.length}</span> package{order.shipments.length > 1 ? 's' : ''}. We’ll notify you at every step.
            </p>
          </div>
          <div className="flex gap-3 rounded-xl bg-slate-50 p-4">
            <KeyRound className="size-5 shrink-0 text-brand-600" />
            <p className="text-sm text-slate-600">Give the courier the delivery code from your order page only after you receive your package.</p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to={`/account/orders/${order.id}`}>Track my order</Button>
          <Button variant="outline" to="/">Continue shopping</Button>
        </div>
      </Card>
    </div>
  );
}
