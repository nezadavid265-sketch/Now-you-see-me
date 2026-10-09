import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleCheck, Circle, ClipboardList, Megaphone, Package, Plus, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, money, timeAgo } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { RevenueChart } from '../../components/Charts.jsx';
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, Stat, StatusBadge, cx } from '../../components/ui/index.jsx';

function Checklist({ items }) {
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Card>
      <CardHeader title="Getting started" description={`${done} of ${items.length} steps complete`} />
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="space-y-2.5">
        {items.map((i) => (
          <li key={i.key} className={cx('flex items-center gap-3 text-sm', i.done ? 'text-slate-400 line-through' : 'text-slate-800')}>
            {i.done ? <CircleCheck className="size-5 text-emerald-500" /> : <Circle className="size-5 text-slate-300" />}
            {i.label}
          </li>
        ))}
      </ul>
      <Button className="mt-5" to={items.find((i) => !i.done)?.key === 'product' ? '/seller/products/new' : '/seller/onboarding'}>
        Continue
      </Button>
    </Card>
  );
}

export default function Dashboard() {
  usePageTitle('Seller dashboard');
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['seller', 'dashboard'], queryFn: () => api('/seller/dashboard'), refetchInterval: 60_000 });
  if (isLoading) return <PageLoader />;

  if (!data.shop) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Welcome, ${user.name.split(' ')[0]}!`} description="Let’s get your shop ready to sell on Rivoshoppa." />
        <EmptyState icon={ShoppingBag} title="Set up your shop" description="Add your business details, create your shop and tell us how to pay you. It takes about 5 minutes." action={<Button size="lg" to="/seller/onboarding">Start setup</Button>} />
        <Checklist items={data.checklist} />
      </div>
    );
  }

  const k = data.kpis;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user.name.split(' ')[0]}`}
        description={`Here’s how ${data.shop.name} is doing.`}
        actions={<Button icon={Plus} to="/seller/products/new">Add product</Button>}
      />

      {k.newOrders > 0 && (
        <Alert tone="info" title={`You have ${k.newOrders} new order${k.newOrders > 1 ? 's' : ''} waiting`} action={<Button size="sm" to="/seller/orders?tab=new">Review orders</Button>}>
          Accept orders quickly so buyers know you’re preparing them.
        </Alert>
      )}
      {k.pendingRefunds > 0 && (
        <Alert tone="warning" title={`${k.pendingRefunds} refund request${k.pendingRefunds > 1 ? 's' : ''} need your response`} action={<Button size="sm" variant="outline" to="/seller/orders?tab=completed">View</Button>}>
          Add your side of the story before Rivoshoppa reviews the request.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales today" value={money(k.revenueToday)} hint={`${k.ordersToday} orders`} icon={ShoppingBag} />
        <Stat label="Last 30 days" value={money(k.revenue30)} hint={`${k.orders30} orders · avg ${money(k.avgOrderValue30)}`} icon={ClipboardList} tone="violet" />
        <Stat label="To prepare / shipped" value={`${k.inProgress} / ${k.inTransit}`} hint="Orders in progress / out for delivery" icon={Truck} tone="amber" to="/seller/orders?tab=in_progress" />
        <Stat label="Available balance" value={money(data.balance.available)} hint={`${money(data.balance.pending)} on hold`} icon={Wallet} tone="green" to="/seller/finance" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales (last 30 days)" description="Product sales from paid and confirmed orders" action={<Button variant="ghost" size="sm" to="/seller/analytics">Full report</Button>} />
          <RevenueChart data={data.series} />
        </Card>
        <div className="space-y-6">
          <Checklist items={data.checklist} />
          <Card>
            <CardHeader title="Low stock" action={<Button variant="ghost" size="sm" to="/seller/inventory">Inventory</Button>} />
            {data.lowStock.length ? (
              <ul className="space-y-2">
                {data.lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link to={`/seller/products/${p.id}`} className="truncate hover:text-brand-700">{p.name}</Link>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', p.stock === 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>
                      {p.stock === 0 ? 'Sold out' : `${p.stock} left`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Package className="size-4" /> All products are well stocked.</p>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Recent orders" action={<Button variant="ghost" size="sm" to="/seller/orders">All orders</Button>} /></div>
          {data.recentOrders.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/seller/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <div>
                      <p className="font-semibold">{o.number}</p>
                      <p className="text-xs text-slate-500">{o.buyerName} · {timeAgo(o.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{money(o.total)}</span>
                      <StatusBadge status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-slate-500">No orders yet. Share your shop link to get your first sale!</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Announcements" />
          {data.announcements.length ? (
            <ul className="space-y-4">
              {data.announcements.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <Megaphone className="mt-0.5 size-4 shrink-0 text-accent-500" />
                  <div>
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{a.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{date(a.publishedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-500"><AlertTriangle className="size-4" /> No announcements.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
