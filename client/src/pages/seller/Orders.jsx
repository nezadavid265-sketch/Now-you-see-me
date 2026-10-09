import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, money, timeAgo } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { ProductImage } from '../../components/ProductCard.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Badge, Button, EmptyState, Input, PageHeader, StatusBadge, Tabs } from '../../components/ui/index.jsx';

const DEFAULTS = { tab: 'new', q: '', page: '1' };

export default function Orders() {
  usePageTitle('Orders');
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({
    queryKey: ['seller', 'orders', params],
    queryFn: () => api('/seller/orders', { query: params }),
    placeholderData: (p) => p,
    refetchInterval: 30_000,
  });
  const tabs = data?.tabs ?? {};

  return (
    <div>
      <PageHeader title="Orders" description="Accept new orders, prepare them and mark them as shipped and delivered." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={params.tab}
          onChange={(tab) => update({ tab })}
          tabs={[
            { value: 'new', label: 'New', count: tabs.new, highlight: true },
            { value: 'in_progress', label: 'To prepare', count: tabs.in_progress },
            { value: 'shipped', label: 'Out for delivery', count: tabs.shipped },
            { value: 'completed', label: 'Completed', count: tabs.completed },
            { value: 'cancelled', label: 'Cancelled', count: tabs.cancelled },
            { value: 'all', label: 'All' },
          ]}
        />
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex gap-2 lg:w-80">
          <Input aria-label="Search orders" placeholder="Order number, buyer or product" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
      </div>
      {!isLoading && !data?.items.length && params.tab === 'new' && !params.q ? (
        <EmptyState icon={ClipboardList} title="No new orders right now" description="New paid or cash-on-delivery orders appear here. We’ll also send you an SMS and notification." />
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items}
          pagination={data?.pagination}
          onPageChange={(p) => update({ page: String(p) })}
          onRowClick={(o) => navigate(`/seller/orders/${o.id}`)}
          empty="No orders in this list."
          columns={[
            {
              key: 'number',
              header: 'Order',
              render: (o) => (
                <div>
                  <p className="font-semibold text-slate-900">{o.number}</p>
                  <p className="text-xs text-slate-500">{timeAgo(o.createdAt)}</p>
                </div>
              ),
            },
            {
              key: 'items',
              header: 'Items',
              hideOnMobile: true,
              render: (o) => (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {o.items.map((i, idx) => <ProductImage key={idx} src={i.productImage} alt="" className="size-9 rounded-md border-2 border-white" />)}
                  </div>
                  <span className="text-xs text-slate-500">{o.itemCount} item{o.itemCount > 1 ? 's' : ''}</span>
                </div>
              ),
            },
            { key: 'buyer', header: 'Deliver to', render: (o) => <span>{o.buyerName}<span className="block text-xs text-slate-500">{o.city}</span></span> },
            { key: 'payment', header: 'Payment', hideOnMobile: true, render: (o) => <Badge tone={o.paymentMethod === 'CASH_ON_DELIVERY' ? 'amber' : 'green'}>{o.paymentMethod === 'CASH_ON_DELIVERY' ? 'Cash on delivery' : `Paid · ${PAYMENT_METHODS[o.paymentMethod]}`}</Badge> },
            { key: 'net', header: 'You earn', render: (o) => <span className="font-semibold tabular-nums">{money(o.sellerNet)}</span> },
            { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
          ]}
        />
      )}
    </div>
  );
}
