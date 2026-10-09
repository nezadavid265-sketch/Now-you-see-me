import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, date, money } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { ProductImage } from '../../components/ProductCard.jsx';
import { Button, EmptyState, PageHeader, Pagination, Skeleton, StatusBadge, Tabs } from '../../components/ui/index.jsx';

const DEFAULTS = { status: 'all', page: '1' };

export default function Orders() {
  usePageTitle('My orders');
  const [params, update] = useListParams(DEFAULTS);
  const { data, isLoading } = useQuery({
    queryKey: ['orders', params],
    queryFn: () => api('/orders', { query: params }),
    placeholderData: (p) => p,
    refetchInterval: 30_000,
  });
  return (
    <div>
      <PageHeader title="My orders" description="Track deliveries, pay pending orders, request refunds and review products." />
      <Tabs
        className="mb-5"
        value={params.status}
        onChange={(v) => update({ status: v })}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'In progress' },
          { value: 'completed', label: 'Delivered' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !data?.items.length ? (
        <EmptyState icon={Package} title="No orders here" description="Orders you place will show up in this list." action={<Button to="/">Start shopping</Button>} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((o) => (
            <li key={o.id}>
              <Link to={`/account/orders/${o.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-shadow hover:shadow-pop sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{o.orderNumber}</p>
                    <p className="text-xs text-slate-500">
                      Placed {date(o.createdAt)} · {PAYMENT_METHODS[o.paymentMethod]} · {o.shipmentCount} shipment{o.shipmentCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    {o.status === 'PENDING_PAYMENT' && <StatusBadge status="PENDING" label="Pay now" />}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {o.thumbnails.map((t, i) => (
                      <ProductImage key={i} src={t.image} alt={t.name} className="size-14 rounded-lg border-2 border-white" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 text-sm text-slate-600">
                    <p className="truncate">{o.thumbnails.map((t) => t.name).join(', ')}</p>
                    <p className="text-xs text-slate-500">from {o.shops.join(', ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{money(o.total, o.currency)}</p>
                    <p className="text-xs text-slate-500">{o.itemCount} items</p>
                  </div>
                  <ChevronRight className="hidden size-5 text-slate-400 sm:block" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination pagination={data?.pagination} onChange={(p) => update({ page: String(p) })} />
    </div>
  );
}
