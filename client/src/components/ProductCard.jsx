import { useState } from 'react';
import { Link } from 'react-router';
import { Heart, ImageOff, ShoppingCart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Price, Skeleton, Stars, cx } from './ui/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';

export function ProductImage({ src, alt, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cx('flex items-center justify-center bg-slate-100 text-slate-300', className)}>
        <ImageOff className="size-8" aria-hidden />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cx('object-cover', className)} />;
}

/** Wishlist ids for the signed-in buyer (shared cache for every card). */
export function useWishlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const enabled = user?.role === 'BUYER';
  const { data } = useQuery({ queryKey: ['wishlist-ids'], queryFn: () => api('/wishlist/ids'), enabled, staleTime: 60_000 });
  const ids = new Set(data?.ids ?? []);
  const toggle = async (productId) => {
    if (!user) {
      toast.info('Sign in to save products to your wishlist.', { action: { label: 'Sign in', to: '/login' } });
      return;
    }
    if (!enabled) return toast.error('Wishlists are available for buyer accounts.');
    const saved = ids.has(productId);
    queryClient.setQueryData(['wishlist-ids'], { ids: saved ? [...ids].filter((i) => i !== productId) : [...ids, productId] });
    try {
      if (saved) await api(`/wishlist/${productId}`, { method: 'DELETE' });
      else await api('/wishlist', { method: 'POST', body: { productId } });
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      if (!saved) toast.success('Saved to your wishlist');
    } catch (err) {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ['wishlist-ids'] });
    }
  };
  return { ids, toggle, enabled };
}

export function ProductCard({ product, wishlist }) {
  const { add } = useCart();
  const [adding, setAdding] = useState(false);
  const saved = wishlist?.ids.has(product.id);
  const lowStock = product.inStock && product.stock <= 5;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-pop">
      <Link to={`/p/${product.slug}`} className="relative block aspect-square overflow-hidden bg-slate-100">
        <ProductImage src={product.image} alt={product.name} className="size-full transition-transform duration-300 group-hover:scale-[1.03]" />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.compareAtPrice && <Badge tone="accent">Deal</Badge>}
          {!product.inStock && <Badge tone="slate">Unavailable</Badge>}
        </div>
      </Link>
      {wishlist && (
        <button
          type="button"
          onClick={() => wishlist.toggle(product.id)}
          className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur hover:text-accent-600"
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          aria-pressed={saved}
        >
          <Heart className={cx('size-[18px]', saved && 'fill-accent-500 text-accent-500')} />
        </button>
      )}
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <Price amount={product.price} compareAt={product.compareAtPrice} />
        <Link to={`/p/${product.slug}`} className="mt-1 line-clamp-2 min-h-10 text-sm font-medium text-slate-800 hover:text-brand-700">
          {product.name}
        </Link>
        <div className="mt-1.5 flex items-center gap-1.5">
          {product.ratingCount > 0 ? <Stars value={product.ratingAvg} count={product.ratingCount} /> : <span className="text-xs text-slate-400">No reviews yet</span>}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          Sold by <Link to={`/shop/${product.shop.slug}`} className="hover:text-brand-700 hover:underline">{product.shop.name}</Link>
        </p>
        {lowStock && <p className="mt-1 text-xs font-semibold text-accent-600">Only {product.stock} left</p>}
        <div className="mt-auto pt-3">
          <Button
            variant={product.inStock ? 'secondary' : 'outline'}
            size="sm"
            className="w-full"
            icon={ShoppingCart}
            disabled={!product.inStock}
            loading={adding}
            onClick={async () => {
              setAdding(true);
              await add(product.id, 1, { name: product.name });
              setAdding(false);
            }}
          >
            {product.inStock ? 'Add to cart' : 'Out of stock'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ products, loading, count = 8, wishlist, className }) {
  return (
    <div className={cx('grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4', className)}>
      {loading
        ? Array.from({ length: count }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Skeleton className="aspect-square rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))
        : products?.map((p) => <ProductCard key={p.id} product={p} wishlist={wishlist} />)}
    </div>
  );
}

/** Horizontally scrolling product row for the home page. */
export function ProductRail({ title, subtitle, products, loading, to, wishlist }) {
  if (!loading && !products?.length) return null;
  return (
    <section className="py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {to && (
          <Link to={to} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            See all
          </Link>
        )}
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {(loading ? Array.from({ length: 5 }) : products).map((p, i) => (
          <div key={p?.id ?? i} className="w-[46%] shrink-0 snap-start sm:w-[31%] md:w-[23%] lg:w-[19%]">
            {p ? <ProductCard product={p} wishlist={wishlist} /> : <Skeleton className="aspect-[3/5]" />}
          </div>
        ))}
      </div>
    </section>
  );
}
