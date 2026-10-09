import { Link, useNavigate } from 'react-router';
import { ShieldCheck, ShoppingCart, Store, Trash2, TriangleAlert, Truck } from 'lucide-react';
import { money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useCart } from '../../context/CartContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useConfig } from '../../context/ConfigContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { Alert, Button, Card, EmptyState, PageLoader, QuantityStepper } from '../../components/ui/index.jsx';

export default function Cart() {
  usePageTitle('Your cart');
  const { cart, isLoading, update, remove, canShop } = useCart();
  const { user } = useAuth();
  const config = useConfig();
  const navigate = useNavigate();

  if (!canShop) {
    return (
      <div className="container-page py-12">
        <EmptyState icon={ShoppingCart} title="Shopping needs a buyer account" description="You are signed in with a staff or seller account. Sign in with a buyer account to place orders." />
      </div>
    );
  }
  if (isLoading) return <PageLoader />;
  if (!cart || !cart.groups?.length) {
    return (
      <div className="container-page py-12">
        <EmptyState icon={ShoppingCart} title="Your cart is empty" description="Discover great products from Rwanda’s trusted sellers." action={<Button to="/">Start shopping</Button>} />
      </div>
    );
  }

  const hasProblems = cart.problems.length > 0;
  const checkout = () => navigate(user ? '/checkout' : '/login?next=/checkout');

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">
        Shopping cart <span className="text-base font-medium text-slate-500">({cart.itemCount} items)</span>
      </h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {hasProblems && (
            <Alert tone="warning" title="Some items need your attention">
              Update or remove the highlighted items before checking out.
            </Alert>
          )}
          {cart.groups.map((group) => (
            <Card key={group.shop.id} padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
                <Link to={`/shop/${group.shop.slug}`} className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-brand-700">
                  <Store className="size-4" /> {group.shop.name}
                </Link>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Truck className="size-4" />
                  {group.deliveryFee === 0 ? 'Free delivery' : `Delivery ${money(group.deliveryFee, cart.currency)} · free over ${money(config.freeDeliveryThreshold)}`}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <li key={item.productId} className="flex gap-4 px-5 py-4">
                    <Link to={`/p/${item.slug}`} className="shrink-0">
                      <ProductImage src={item.image} alt={item.name} className="size-20 rounded-lg sm:size-24" />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex justify-between gap-3">
                        <Link to={`/p/${item.slug}`} className="line-clamp-2 text-sm font-medium text-slate-800 hover:text-brand-700">
                          {item.name}
                        </Link>
                        <p className="shrink-0 text-sm font-bold tabular-nums">{money(item.lineTotal, cart.currency)}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{money(item.unitPrice, cart.currency)} each</p>
                      {!item.available && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                          <TriangleAlert className="size-3.5" /> {item.reason}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <QuantityStepper size="sm" value={item.quantity} max={Math.max(1, Math.min(99, item.stock))} onChange={(q) => update(item.productId, q)} />
                        <button type="button" onClick={() => remove(item.productId)} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600">
                          <Trash2 className="size-4" /> Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <Card>
            <h2 className="text-lg font-semibold">Order summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd className="font-medium tabular-nums">{money(cart.subtotal, cart.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">Delivery ({cart.groups.length} shop{cart.groups.length > 1 ? 's' : ''})</dt><dd className="font-medium tabular-nums">{cart.deliveryFee ? money(cart.deliveryFee, cart.currency) : 'Free'}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold tabular-nums">{money(cart.total, cart.currency)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Promo codes can be applied at checkout.</p>
            <Button size="lg" variant="accent" className="mt-5 w-full" disabled={hasProblems} onClick={checkout}>
              {user ? 'Proceed to checkout' : 'Sign in to check out'}
            </Button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="size-4 text-brand-600" /> Prices are confirmed securely at checkout
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
