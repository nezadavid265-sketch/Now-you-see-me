import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, ShieldCheck, Smartphone, Truck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { recentlyViewed } from '../../lib/storage.js';
import { usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CategoryIcon } from '../../components/CategoryIcon.jsx';
import { ProductRail, useWishlist } from '../../components/ProductCard.jsx';
import { Skeleton, cx } from '../../components/ui/index.jsx';

const THEMES = {
  brand: 'from-brand-800 via-brand-700 to-brand-500',
  accent: 'from-accent-600 via-accent-500 to-amber-400',
  dark: 'from-slate-900 via-slate-800 to-brand-900',
  sunrise: 'from-rose-700 via-accent-600 to-amber-500',
  forest: 'from-emerald-900 via-emerald-700 to-lime-500',
};

function HeroCarousel({ banners }) {
  const [index, setIndex] = useState(0);
  const count = banners.length;
  useEffect(() => {
    if (count < 2) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count]);
  if (!count) return null;
  const b = banners[index];
  return (
    <section className="relative overflow-hidden rounded-2xl" aria-roledescription="carousel" aria-label="Promotions">
      <div className={cx('relative flex min-h-[260px] items-center bg-gradient-to-br px-6 py-10 text-white sm:min-h-[340px] sm:px-12', THEMES[b.theme] ?? THEMES.brand)}>
        {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30 mix-blend-overlay" />}
        <svg className="absolute -right-16 -bottom-20 size-96 text-white/10" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="50" fill="currentColor" />
        </svg>
        <div key={b.id} className="animate-fade-in relative z-10 max-w-xl">
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">{b.title}</h1>
          {b.subtitle && <p className="mt-3 text-base text-white/90 sm:text-lg">{b.subtitle}</p>}
          {b.linkUrl && (
            <Link to={b.linkUrl} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg hover:bg-slate-100">
              {b.ctaLabel ?? 'Shop now'} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
      {count > 1 && (
        <>
          <button type="button" onClick={() => setIndex((index - 1 + count) % count)} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur hover:bg-white/30 sm:block" aria-label="Previous promotion">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => setIndex((index + 1) % count)} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 text-white backdrop-blur hover:bg-white/30 sm:block" aria-label="Next promotion">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {banners.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setIndex(i)} aria-label={`Show promotion ${i + 1}`} aria-current={i === index} className={cx('h-2 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-2 bg-white/50')} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function Home() {
  usePageTitle(null);
  const { user } = useAuth();
  const wishlist = useWishlist();
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: () => api('/home'), staleTime: 60_000 });
  const viewed = recentlyViewed();
  const { data: recommended, isLoading: recLoading } = useQuery({
    queryKey: ['recommended', user?.id, viewed.join(',')],
    queryFn: () => api('/home/recommended', { query: { viewed } }),
    staleTime: 60_000,
  });
  const hero = data?.banners.filter((b) => b.position === 'HOME_HERO') ?? [];
  const strip = data?.banners.filter((b) => b.position === 'HOME_STRIP') ?? [];

  return (
    <div className="container-page py-6">
      {isLoading ? <Skeleton className="h-[300px] rounded-2xl" /> : <HeroCarousel banners={hero} />}

      <section className="py-8" aria-labelledby="cat-heading">
        <h2 id="cat-heading" className="mb-4 text-xl font-bold tracking-tight">Shop by category</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-8">
          {(isLoading ? Array.from({ length: 8 }) : data.categories).map((c, i) =>
            c ? (
              <Link key={c.id} to={`/search?category=${c.slug}`} className="group flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center transition-shadow hover:shadow-pop sm:p-4">
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white sm:size-14">
                  <CategoryIcon name={c.icon} className="size-6" />
                </span>
                <span className="line-clamp-2 text-xs font-semibold text-slate-700 sm:text-sm">{c.name}</span>
              </Link>
            ) : (
              <Skeleton key={i} className="h-28" />
            ),
          )}
        </div>
      </section>

      <ProductRail title="Today’s deals" subtitle="Limited-time prices from local sellers" products={data?.deals} loading={isLoading} to="/search?onSale=true" wishlist={wishlist} />

      {strip.length > 0 && (
        <section className="grid gap-4 py-4 md:grid-cols-2">
          {strip.map((b) => (
            <Link key={b.id} to={b.linkUrl ?? '/'} className={cx('group relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 text-white sm:p-8', THEMES[b.theme] ?? THEMES.brand)}>
              <p className="text-xl font-bold sm:text-2xl">{b.title}</p>
              {b.subtitle && <p className="mt-1 max-w-sm text-sm text-white/85">{b.subtitle}</p>}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                {b.ctaLabel ?? 'Learn more'} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </section>
      )}

      <ProductRail title="Featured products" subtitle="Hand-picked by the Rivoshoppa team" products={data?.featured} loading={isLoading} wishlist={wishlist} />
      <ProductRail title={user ? 'Recommended for you' : 'You might like'} subtitle="Based on what you’ve viewed and bought" products={recommended?.items} loading={recLoading} wishlist={wishlist} />
      <ProductRail title="Best sellers" products={data?.popular} loading={isLoading} to="/search?sort=popular" wishlist={wishlist} />
      <ProductRail title="New arrivals" products={data?.newArrivals} loading={isLoading} to="/search?sort=newest" wishlist={wishlist} />

      <section className="mt-8 grid gap-4 rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Smartphone, 'Pay your way', 'MTN MoMo, Airtel Money or cash on delivery.'],
          [BadgeCheck, 'Verified sellers', 'Every shop is reviewed before it goes live.'],
          [Truck, 'Track every package', 'Live status updates and delivery codes.'],
          [ShieldCheck, 'Buyer protection', 'Refunds handled by our support team.'],
        ].map(([Icon, title, text]) => (
          <div key={title} className="flex gap-3">
            <Icon className="size-8 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="text-sm text-slate-500">{text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
