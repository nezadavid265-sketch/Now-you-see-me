import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Package, Store } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { ProductGrid, useWishlist } from '../../components/ProductCard.jsx';
import { Alert, Button, EmptyState, Input, PageLoader, Pagination, Select, Stars } from '../../components/ui/index.jsx';

const DEFAULTS = { q: '', sort: 'popular', page: '1' };

export default function ShopPage() {
  const { slug } = useParams();
  const [params, update] = useListParams(DEFAULTS);
  const wishlist = useWishlist();
  const shopQuery = useQuery({ queryKey: ['shop', slug], queryFn: () => api(`/shops/${slug}`) });
  const products = useQuery({
    queryKey: ['shop-products', slug, params],
    queryFn: () => api('/products', { query: { shop: slug, q: params.q, sort: params.sort, page: params.page, pageSize: 24 } }),
    enabled: Boolean(shopQuery.data),
    placeholderData: (prev) => prev,
  });
  const shop = shopQuery.data?.shop;
  usePageTitle(shop?.name);

  if (shopQuery.isLoading) return <PageLoader />;
  if (shopQuery.error) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={Store} title="Shop not found" description="This shop may be closed or no longer on Rivoshoppa." action={<Button to="/">Back to shopping</Button>} />
      </div>
    );
  }

  return (
    <div>
      <div className="h-36 bg-gradient-to-r from-brand-800 to-brand-500 sm:h-48">
        {shop.bannerUrl && <img src={shop.bannerUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="container-page">
        <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
          {shop.logoUrl ? (
            <img src={shop.logoUrl} alt={`${shop.name} logo`} className="size-24 rounded-2xl border-4 border-white bg-white object-cover shadow-card" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-2xl border-4 border-white bg-brand-50 text-brand-700 shadow-card">
              <Store className="size-10" />
            </div>
          )}
          <div className="flex-1 pb-1">
            <h1 className="text-2xl font-bold tracking-tight">{shop.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              {shop.ratingCount ? <Stars value={shop.ratingAvg} showValue count={shop.ratingCount} /> : <span>New seller</span>}
              {shop.city && <span className="flex items-center gap-1"><MapPin className="size-4" /> {shop.city}</span>}
              <span className="flex items-center gap-1"><Package className="size-4" /> {shop.productCount} products</span>
              <span>Selling since {new Date(shop.memberSince).getFullYear()}</span>
            </div>
          </div>
        </div>
        {shop.description && <p className="mt-4 max-w-3xl text-sm text-slate-600">{shop.description}</p>}
        {!shop.isOpen && (
          <Alert className="mt-4" tone="warning" title="This shop is temporarily closed">
            {shop.vacationMessage ?? 'You can browse products, but orders are paused for now.'}
          </Alert>
        )}

        <div className="mt-8 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: new FormData(e.currentTarget).get('q') });
            }}
            className="w-full sm:max-w-xs"
          >
            <Input name="q" defaultValue={params.q} placeholder={`Search ${shop.name}`} aria-label="Search this shop" />
          </form>
          <Select aria-label="Sort" value={params.sort} onChange={(e) => update({ sort: e.target.value })} className="w-48" options={[{ value: 'popular', label: 'Best selling' }, { value: 'newest', label: 'Newest' }, { value: 'price_asc', label: 'Price: low to high' }, { value: 'price_desc', label: 'Price: high to low' }, { value: 'rating', label: 'Top rated' }]} />
        </div>
        {products.data && !products.data.items.length ? (
          <EmptyState title="No products found" description={params.q ? 'Try another search.' : 'This shop has not listed any products yet.'} />
        ) : (
          <ProductGrid products={products.data?.items} loading={products.isLoading} wishlist={wishlist} />
        )}
        <Pagination pagination={products.data?.pagination} onChange={(p) => update({ page: String(p) })} />
      </div>
    </div>
  );
}
