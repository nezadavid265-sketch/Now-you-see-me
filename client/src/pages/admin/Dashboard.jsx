import { Link } from 'react-router';
import { ClipboardList, CreditCard, LifeBuoy, Package, RotateCcw, ShoppingBag, Store, Truck, Users, Wallet } from 'lucide-react';
import { compactMoney, money, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { RevenueChart } from '../../components/Charts.jsx';
import { Card, CardHeader, PageHeader, PageLoader, Stat, StatusBadge } from '../../components/ui/index.jsx';

function Task({ to, icon: Icon, label, count, show = true }) {
  if (!show) return null;
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-brand-300 hover:bg-brand-50/40">
      <span className="flex items-center gap-3 font-medium text-slate-700"><Icon className="size-4 text-slate-400" /> {label}</span>
      <span className={count ? 'rounded-full bg-accent-500 px-2 py-0.5 text-xs font-bold text-white' : 'text-xs text-slate-400'}>{count || 'None'}</span>
    </Link>
  );
}

export default function Dashboard({ data }) {
  usePageTitle('Admin dashboard');
  const { user, can } = useAuth();
  if (!data) return <PageLoader />;
  const t = data.totals;
  const p = data.pending;
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back, ${user.name.split(' ')[0]}`} description="Marketplace overview — updated every minute." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales (30 days)" value={compactMoney(t.gmv30)} hint={`${t.orders30} shipments`} icon={ShoppingBag} />
        <Stat label="Commission earned (30 days)" value={compactMoney(t.commission30)} hint="On delivered orders" icon={Wallet} tone="green" />
        <Stat label="Orders" value={t.orders.toLocaleString()} hint={`${t.ordersToday} today`} icon={ClipboardList} tone="violet" to={can('orders') ? '/admin/orders' : undefined} />
        <Stat label="Buyers / active shops" value={`${t.buyers.toLocaleString()} / ${t.activeShops}`} hint={`${t.publishedProducts} live products`} icon={Users} tone="amber" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Marketplace sales" description="Paid and confirmed shipments, last 30 days" />
          <RevenueChart data={data.series} />
        </Card>
        <Card>
          <CardHeader title="Needs attention" />
          <div className="space-y-2">
            <Task to="/admin/sellers?status=PENDING" icon={Store} label="Seller applications" count={p.sellerApplications} show={can('sellers')} />
            <Task to="/admin/products?moderation=PENDING" icon={Package} label="Products to review" count={p.productReviews} show={can('catalog')} />
            <Task to="/admin/deliveries?unassigned=true" icon={Truck} label="Deliveries without courier" count={p.unassignedDeliveries} show={can('orders')} />
            <Task to="/admin/refunds" icon={RotateCcw} label="Refunds to process" count={p.refunds} show={can('finance')} />
            <Task to="/admin/payouts" icon={CreditCard} label={`Pending payouts${p.payoutAmount ? ` (${money(p.payoutAmount)})` : ''}`} count={p.payouts} show={can('finance')} />
            <Task to="/admin/tickets" icon={LifeBuoy} label="Open support tickets" count={p.tickets} show={can('support')} />
          </div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 pb-2"><CardHeader title="Latest orders" className="mb-0" /></div>
          <ul className="divide-y divide-slate-100">
            {data.recentOrders.map((o) => (
              <li key={o.id}>
                <Link to={can('orders') ? `/admin/orders/${o.id}` : '#'} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                  <div>
                    <p className="font-semibold">{o.orderNumber}</p>
                    <p className="text-xs text-slate-500">{o.buyer} · {timeAgo(o.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3"><span className="font-semibold tabular-nums">{money(o.total)}</span><StatusBadge status={o.status} /></div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card padded={false}>
          <div className="p-5 pb-2"><CardHeader title="Top shops (30 days)" className="mb-0" /></div>
          <ul className="divide-y divide-slate-100">
            {data.topShops.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">{i + 1}</span><Link to={`/shop/${s.slug}`} className="font-medium hover:text-brand-700">{s.name}</Link></span>
                <span className="text-right"><span className="font-semibold tabular-nums">{money(s.revenue)}</span><span className="block text-xs text-slate-500">{s.orders} orders</span></span>
              </li>
            ))}
            {!data.topShops.length && <li className="px-5 pb-5 text-sm text-slate-500">No sales yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
