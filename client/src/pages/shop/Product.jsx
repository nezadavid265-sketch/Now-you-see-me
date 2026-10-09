import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight, Heart, MessageSquare, PackageCheck, RotateCcw, ShieldCheck, ShoppingCart, Store, Truck, Zap } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, money } from '../../lib/format.js';
import { rememberViewed } from '../../lib/storage.js';
import { usePageTitle } from '../../hooks/index.js';
import { useCart } from '../../context/CartContext.jsx';
import { useConfig } from '../../context/ConfigContext.jsx';
import { ProductImage, ProductRail, useWishlist } from '../../components/ProductCard.jsx';
import { Alert, Badge, Button, Card, EmptyState, PageLoader, Pagination, Price, QuantityStepper, Select, Stars, cx } from '../../components/ui/index.jsx';

function Gallery({ images, name }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {images.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto sm:w-20 sm:flex-col">
          {images.map((img, i) => (
            <button key={img.id} type="button" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} className={cx('size-16 shrink-0 overflow-hidden rounded-lg border-2 sm:size-20', i === active ? 'border-brand-600' : 'border-transparent hover:border-slate-300')}>
              <ProductImage src={img.url} alt="" className="size-full" />
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <ProductImage src={current?.url} alt={current?.alt ?? name} className="aspect-square w-full" />
      </div>
    </div>
  );
}

function Reviews({ product }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const { data } = useQuery({
    queryKey: ['reviews', product.slug, page, sort],
    queryFn: () => api(`/products/${product.slug}/reviews`, { query: { page, sort } }),
    placeholderData: (prev) => prev,
  });
  const total = product.ratingCount;
  return (
    <section id="reviews" className="scroll-mt-28">
      <h2 className="mb-4 text-xl font-bold">Customer reviews</h2>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-extrabold">{product.ratingAvg ? product.ratingAvg.toFixed(1) : '—'}</span>
            <div>
              <Stars value={product.ratingAvg} size="md" />
              <p className="text-xs text-slate-500">{total} verified review{total === 1 ? '' : 's'}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5">
            {product.ratingDistribution.map((r) => (
              <li key={r.rating} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-slate-600">{r.rating}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
                </span>
                <span className="w-6 text-right text-xs text-slate-500">{r.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Only customers who received this product can leave a review.</p>
        </Card>
        <div>
          {data?.items?.length ? (
            <>
              <div className="mb-3 flex justify-end">
                <Select aria-label="Sort reviews" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} options={[{ value: 'newest', label: 'Newest' }, { value: 'highest', label: 'Highest rated' }, { value: 'lowest', label: 'Lowest rated' }]} className="w-44" />
              </div>
              <ul className="space-y-4">
                {data.items.map((r) => (
                  <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.rating} />
                      {r.title && <p className="font-semibold text-slate-900">{r.title}</p>}
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      {r.author} · {date(r.createdAt)}
                      <Badge tone="green"><BadgeCheck className="size-3" /> Verified purchase</Badge>
                    </p>
                    <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{r.body}</p>
                    {r.sellerReply && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><MessageSquare className="size-3.5" /> Response from the seller</p>
                        <p className="mt-1 text-slate-700">{r.sellerReply}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination pagination={data.pagination} onChange={setPage} />
            </>
          ) : (
            <EmptyState title="No reviews yet" description="Bought this product? Review it from your order page after delivery." />
          )}
        </div>
      </div>
    </section>
  );
}

export default function Product() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const config = useConfig();
  const { add, canShop } = useCart();
  const wishlist = useWishlist();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['product', slug], queryFn: () => api(`/products/${slug}`) });
  const { data: related } = useQuery({ queryKey: ['related', slug], queryFn: () => api(`/products/${slug}/related`), enabled: Boolean(data) });
  const product = data?.product;
  usePageTitle(product?.name);
  useEffect(() => {
    if (product) rememberViewed(product.slug);
    setQty(1);
  }, [product]);

  if (isLoading) return <PageLoader />;
  if (error) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Product not available" description="This product may have been removed or is temporarily unavailable." action={<Button to="/search">Browse products</Button>} />
      </div>
    );
  }

  const saved = wishlist.ids.has(product.id);
  const addToCart = async (buyNow) => {
    setBusy(buyNow ? 'buy' : 'add');
    const ok = await add(product.id, qty, { name: product.name, silent: buyNow });
    setBusy(null);
    if (ok && buyNow) navigate('/cart');
  };
  const freeDelivery = product.price * qty >= config.freeDeliveryThreshold;

  return (
    <div className="container-page py-6">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-brand-700">Home</Link>
        {product.breadcrumb.map((b) => (
          <span key={b.slug} className="flex items-center gap-1">
            <ChevronRight className="size-4" />
            <Link to={`/search?category=${b.slug}`} className="hover:text-brand-700">{b.name}</Link>
          </span>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.2fr_1fr_320px]">
        <Gallery images={product.images} name={product.name} />

        <div>
          {product.brand && <p className="text-sm font-semibold text-brand-700">{product.brand}</p>}
          <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{product.name}</h1>
          <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-brand-700">
            <Stars value={product.ratingAvg} size="md" showValue={product.ratingCount > 0} />
            <span>{product.ratingCount ? `${product.ratingCount} reviews` : 'No reviews yet'}</span>
            {product.soldCount > 0 && <span className="text-slate-400">· {product.soldCount} sold</span>}
          </a>
          <div className="mt-5">
            <Price amount={product.price} compareAt={product.compareAtPrice} size="xl" />
            {product.compareAtPrice && <p className="mt-1 text-sm font-semibold text-emerald-700">You save {money(product.compareAtPrice - product.price)}</p>}
          </div>

          <div className="mt-5 space-y-3">
            {!product.available ? (
              <Alert tone="warning" title="Currently unavailable">{product.unavailableReason}</Alert>
            ) : product.lowStock ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-accent-600"><Zap className="size-4" /> Only {product.stock} left in stock — order soon</p>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><PackageCheck className="size-4" /> In stock</p>
            )}
          </div>

          {product.available && canShop && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <QuantityStepper value={qty} onChange={setQty} max={Math.min(product.stock, 99)} />
              <Button size="lg" icon={ShoppingCart} className="flex-1 sm:flex-none" loading={busy === 'add'} onClick={() => addToCart(false)}>
                Add to cart
              </Button>
              <Button size="lg" variant="accent" className="flex-1 sm:flex-none" loading={busy === 'buy'} onClick={() => addToCart(true)}>
                Buy now
              </Button>
              <button type="button" onClick={() => wishlist.toggle(product.id)} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'} className="flex size-12 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:text-accent-600">
                <Heart className={cx('size-5', saved && 'fill-accent-500 text-accent-500')} />
              </button>
            </div>
          )}
          {!canShop && <Alert className="mt-5" tone="info">Use a buyer account to purchase products.</Alert>}

          <section className="mt-8">
            <h2 className="mb-2 text-lg font-bold">About this product</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{product.description}</p>
          </section>
          {product.specifications.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-lg font-bold">Specifications</h2>
              <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
                {product.specifications.map((s) => (
                  <div key={s.name} className="grid grid-cols-[140px_1fr] gap-4 px-4 py-2.5 sm:grid-cols-[180px_1fr]">
                    <dt className="text-slate-500">{s.name}</dt>
                    <dd className="font-medium text-slate-800">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:col-span-2 xl:col-span-1">
          <Card>
            <div className="space-y-4 text-sm">
              <div className="flex gap-3">
                <Truck className="size-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-slate-900">{freeDelivery ? 'Free delivery' : `Delivery from ${money(config.deliveryFeeBase)}`}</p>
                  <p className="text-slate-500">
                    {freeDelivery ? 'This order qualifies for free delivery.' : `Free when you spend ${money(config.freeDeliveryThreshold)} at this shop.`}{' '}
                    {product.shop.fulfillmentMode === 'MARKETPLACE' ? 'Delivered by Rivoshoppa couriers.' : 'Delivered by the seller.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <RotateCcw className="size-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-slate-900">{config.refundWindowDays}-day refunds</p>
                  <p className="text-slate-500">Request a refund for damaged or incorrect items.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="size-5 shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold text-slate-900">Secure payment</p>
                  <p className="text-slate-500">Pay with Mobile Money or cash on delivery.</p>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Sold by</p>
            <Link to={`/shop/${product.shop.slug}`} className="mt-3 flex items-center gap-3">
              {product.shop.logoUrl ? <img src={product.shop.logoUrl} alt="" className="size-12 rounded-lg object-cover" /> : <Store className="size-12 rounded-lg bg-slate-100 p-3 text-slate-400" />}
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 hover:text-brand-700">{product.shop.name}</p>
                <p className="text-xs text-slate-500">{product.shop.city ?? 'Rwanda'} · since {new Date(product.shop.memberSince).getFullYear()}</p>
              </div>
            </Link>
            <div className="mt-3 flex items-center justify-between text-sm">
              {product.shop.ratingCount ? <Stars value={product.shop.ratingAvg} showValue count={product.shop.ratingCount} /> : <span className="text-slate-500">New seller</span>}
              <span className="text-slate-500">{product.shop.productCount} products</span>
            </div>
            {!product.shop.isOpen && <Alert className="mt-3" tone="warning">{product.shop.vacationMessage ?? 'This shop is temporarily closed.'}</Alert>}
            <Button to={`/shop/${product.shop.slug}`} variant="outline" size="sm" className="mt-4 w-full" icon={Store}>
              Visit shop
            </Button>
          </Card>
        </aside>
      </div>

      <div className="mt-12 space-y-10">
        <Reviews product={product} />
        <ProductRail title="Related products" products={related?.items} wishlist={wishlist} />
      </div>
    </div>
  );
}
