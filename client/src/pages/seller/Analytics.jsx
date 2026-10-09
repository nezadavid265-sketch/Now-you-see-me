import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { DistributionBars, OrdersBarChart, RevenueChart } from '../../components/Charts.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { Card, CardHeader, PageHeader, PageLoader, Select, Stat } from '../../components/ui/index.jsx';

export default function Analytics() {
  usePageTitle('Sales reports');
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ['seller', 'analytics', days], queryFn: () => api('/seller/analytics', { query: { days } }), placeholderData: (p) => p });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales reports"
        description="Understand what sells and how your shop is growing."
        actions={<Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-44" options={[{ value: 7, label: 'Last 7 days' }, { value: 30, label: 'Last 30 days' }, { value: 90, label: 'Last 90 days' }, { value: 365, label: 'Last 12 months' }]} />}
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Product sales" value={money(data.totals.revenue)} hint={`${data.totals.orders} orders`} />
            <Stat label="Your earnings" value={money(data.totals.net)} hint={`after ${money(data.totals.commission)} commission`} tone="green" />
            <Stat label="Average order" value={money(data.totals.avgOrderValue)} tone="violet" />
            <Stat label="Cancellation rate" value={`${data.totals.cancellationRate}%`} hint="Lower is better for buyer trust" tone="amber" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Revenue" />
              <RevenueChart data={data.series} />
            </Card>
            <Card>
              <CardHeader title="Orders per day" />
              <OrdersBarChart data={data.series} height={260} />
            </Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2" padded={false}>
              <div className="p-5 pb-2"><CardHeader title="Best-selling products" className="mb-0" /></div>
              {data.topProducts.length ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr><th className="px-5 py-2 text-left">Product</th><th className="px-5 py-2 text-right">Units</th><th className="px-5 py-2 text-right">Revenue</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.topProducts.map((p) => (
                      <tr key={p.productId}>
                        <td className="px-5 py-2.5"><div className="flex items-center gap-3"><ProductImage src={p.image} alt="" className="size-9 rounded-md" /><span className="truncate">{p.name}</span></div></td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{p.units}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{money(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-5 pb-5 text-sm text-slate-500">No sales in this period yet.</p>
              )}
            </Card>
            <div className="space-y-6">
              <Card>
                <CardHeader title="Orders by status" />
                {data.ordersByStatus.length ? <DistributionBars items={data.ordersByStatus.map((s) => ({ label: s.label, value: s.count }))} /> : <p className="text-sm text-slate-500">No orders yet.</p>}
              </Card>
              <Card>
                <CardHeader title="Customer ratings" />
                <DistributionBars items={data.ratings.map((r) => ({ label: `${r.rating} stars`, value: r.count }))} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
