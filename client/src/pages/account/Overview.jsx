import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Heart, LifeBuoy, MapPin, Package, Settings } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { Button, Card, CardHeader, EmptyState, Skeleton, StatusBadge } from '../../components/ui/index.jsx';

export default function Overview() {
  usePageTitle('My account');
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['orders', 'recent'], queryFn: () => api('/orders', { query: { pageSize: 3 } }) });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hello, {user.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your orders, addresses and account settings.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['/account/orders', Package, 'Orders'],
          ['/account/wishlist', Heart, 'Wishlist'],
          ['/account/addresses', MapPin, 'Addresses'],
          ['/account/support', LifeBuoy, 'Support'],
        ].map(([to, Icon, label]) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-card hover:border-brand-300 hover:text-brand-800">
            <Icon className="size-6 text-brand-600" /> {label}
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader title="Recent orders" action={<Button variant="ghost" size="sm" to="/account/orders">View all</Button>} />
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : !data?.items.length ? (
          <EmptyState icon={Package} title="No orders yet" description="When you place an order it will appear here." action={<Button to="/">Start shopping</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/account/orders/${o.id}`} className="flex items-center gap-4 py-3 hover:opacity-80">
                  <div className="flex -space-x-3">
                    {o.thumbnails.slice(0, 3).map((t, i) => (
                      <ProductImage key={i} src={t.image} alt="" className="size-12 rounded-lg border-2 border-white" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{o.orderNumber}</p>
                    <p className="text-xs text-slate-500">{date(o.createdAt)} · {o.itemCount} items · {money(o.total, o.currency)}</p>
                  </div>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Settings className="size-5 text-slate-400" />
          <div>
            <p className="text-sm font-semibold">Account settings</p>
            <p className="text-xs text-slate-500">Update your details, password and notification preferences.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" to="/account/settings">Manage</Button>
      </Card>
    </div>
  );
}
