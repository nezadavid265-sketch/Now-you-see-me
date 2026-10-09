import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { ProductGrid, useWishlist } from '../../components/ProductCard.jsx';
import { Button, Checkbox, EmptyState, Pagination, Select, Stars, cx } from '../../components/ui/index.jsx';

const DEFAULTS = { q: '', category: '', brands: '', minPrice: '', maxPrice: '', rating: '', inStock: '', onSale: '', sort: 'relevance', page: '1' };
const SORTS = [
  { value: 'relevance', label: 'Best match' },
  { value: 'popular', label: 'Best selling' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Customer rating' },
];

function Filters({ params, update, facets, categoryTree, category }) {
  const [min, setMin] = useState(params.minPrice);
  const [max, setMax] = useState(params.maxPrice);
  useEffect(() => {
    setMin(params.minPrice);
    setMax(params.maxPrice);
  }, [params.minPrice, params.maxPrice]);
  const selectedBrands = params.brands ? params.brands.split(',') : [];
  const toggleBrand = (b) => update({ brands: (selectedBrands.includes(b) ? selectedBrands.filter((x) => x !== b) : [...selectedBrands, b]).join(',') });
  const subcategories = category?.children?.length ? category.children : !category ? categoryTree : [];

  return (
    <div className="space-y-6 text-sm">
      {subcategories?.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-slate-900">{category ? 'Subcategories' : 'Categories'}</h3>
          <ul className="space-y-1">
            {subcategories.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => update({ category: c.slug })} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                  {c.name}
                  {c.productCount !== undefined && <span className="text-xs text-slate-400">{c.productCount}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 font-semibold text-slate-900">Price (RWF)</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ minPrice: min, maxPrice: max });
          }}
        >
          <input aria-label="Minimum price" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} placeholder={facets?.price.min ? String(facets.price.min) : 'Min'} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          <span className="text-slate-400">–</span>
          <input aria-label="Maximum price" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} placeholder={facets?.price.max ? String(facets.price.max) : 'Max'} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          <Button type="submit" size="sm" variant="outline">Go</Button>
        </form>
      </section>
      <section>
        <h3 className="mb-2 font-semibold text-slate-900">Customer rating</h3>
        <div className="space-y-1">
          {[4, 3, 2].map((r) => (
            <button key={r} type="button" onClick={() => update({ rating: params.rating === String(r) ? '' : String(r) })} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100', params.rating === String(r) && 'bg-brand-50')}>
              <Stars value={r} /> <span className="text-slate-600">& up</span>
            </button>
          ))}
        </div>
      </section>
      {facets?.brands?.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-slate-900">Brand</h3>
          <div className="space-y-2">
            {facets.brands.map((b) => (
              <Checkbox key={b.value} label={`${b.value} (${b.count})`} checked={selectedBrands.includes(b.value)} onChange={() => toggleBrand(b.value)} />
            ))}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <h3 className="mb-2 font-semibold text-slate-900">Availability</h3>
        <Checkbox label="In stock only" checked={params.inStock === 'true'} onChange={(e) => update({ inStock: e.target.checked ? 'true' : '' })} />
        <Checkbox label="On sale" checked={params.onSale === 'true'} onChange={(e) => update({ onSale: e.target.checked ? 'true' : '' })} />
      </section>
    </div>
  );
}

export default function Search() {
  const [params, update] = useListParams(DEFAULTS);
  const [showFilters, setShowFilters] = useState(false);
  const wishlist = useWishlist();
  const { data: tree } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories'), staleTime: 5 * 60_000 });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', params],
    queryFn: () => api('/products', { query: { ...params, pageSize: 24 } }),
    placeholderData: (prev) => prev,
  });
  const title = data?.category?.name ?? (params.q ? `Results for “${params.q}”` : params.onSale ? 'Deals' : 'All products');
  usePageTitle(title);

  const chips = [
    params.q && { key: 'q', label: `“${params.q}”` },
    params.brands && { key: 'brands', label: params.brands.split(',').join(', ') },
    (params.minPrice || params.maxPrice) && { key: 'price', label: `${params.minPrice ? money(params.minPrice) : 'Any'} – ${params.maxPrice ? money(params.maxPrice) : 'Any'}`, clear: { minPrice: '', maxPrice: '' } },
    params.rating && { key: 'rating', label: `${params.rating}★ & up` },
    params.inStock && { key: 'inStock', label: 'In stock' },
    params.onSale && { key: 'onSale', label: 'On sale' },
  ].filter(Boolean);

  return (
    <div className="container-page py-6">
      <nav className="mb-3 flex items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-brand-700">Home</Link>
        <ChevronRight className="size-4" />
        {data?.category ? <span className="text-slate-800">{data.category.name}</span> : <span className="text-slate-800">Search</span>}
      </nav>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{data ? `${data.pagination.total.toLocaleString()} products` : 'Searching…'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={SlidersHorizontal} className="lg:hidden" onClick={() => setShowFilters(true)}>
            Filters
          </Button>
          <Select aria-label="Sort by" value={params.sort} onChange={(e) => update({ sort: e.target.value })} options={SORTS} className="w-52" />
        </div>
      </div>
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => update(c.clear ?? { [c.key]: '' })} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
              {c.label} <X className="size-3.5" />
            </button>
          ))}
          <button type="button" onClick={() => update({ ...DEFAULTS, category: params.category })} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
            Clear all
          </button>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <Filters params={params} update={update} facets={data?.facets} categoryTree={tree?.items} category={data?.category} />
        </aside>
        <div className={cx(isFetching && !isLoading && 'opacity-60 transition-opacity')}>
          {!isLoading && data && !data.items.length ? (
            <EmptyState
              icon={SearchX}
              title="No products match your search"
              description="Try different keywords, remove some filters or browse our categories."
              action={<Button onClick={() => update({ ...DEFAULTS })}>Clear filters</Button>}
            />
          ) : (
            <ProductGrid products={data?.items} loading={isLoading} count={12} wishlist={wishlist} className="lg:grid-cols-3 xl:grid-cols-4" />
          )}
          <Pagination pagination={data?.pagination} onChange={(page) => update({ page: String(page) })} className="mt-4" />
        </div>
      </div>
      {showFilters && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowFilters(false)} aria-hidden />
          <div className="animate-fade-in absolute inset-y-0 right-0 flex w-80 max-w-[90vw] flex-col bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="font-semibold">Filters</p>
              <button type="button" onClick={() => setShowFilters(false)} aria-label="Close filters" className="rounded p-1 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <Filters params={params} update={update} facets={data?.facets} categoryTree={tree?.items} category={data?.category} />
            </div>
            <div className="border-t border-slate-200 p-4">
              <Button className="w-full" onClick={() => setShowFilters(false)}>
                Show {data?.pagination.total ?? ''} results
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
