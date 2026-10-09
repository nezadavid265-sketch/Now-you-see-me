import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { money } from '../lib/format.js';
import { useDebounce } from '../hooks/index.js';
import { ProductImage } from './ProductCard.jsx';
import { cx } from './ui/index.jsx';

/** Product search with live suggestions (products + categories). */
export function SearchBar({ className }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(q.trim(), 200);
  const wrapper = useRef(null);

  const { data } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: ({ signal }) => api('/products/suggest', { query: { q: debounced }, signal }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
  const options = [
    ...(data?.categories ?? []).map((c) => ({ type: 'category', label: c.name, to: `/search?category=${c.slug}` })),
    ...(data?.products ?? []).map((p) => ({ type: 'product', label: p.name, to: `/p/${p.slug}`, image: p.image, price: p.price })),
  ];

  useEffect(() => {
    const close = (e) => !wrapper.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (to) => {
    setOpen(false);
    setActive(-1);
    navigate(to);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (active >= 0 && options[active]) return go(options[active].to);
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e) => {
    if (!open || !options.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={wrapper} className={cx('relative', className)}>
      <form onSubmit={onSubmit} role="search">
        <label htmlFor="site-search" className="sr-only">
          Search products
        </label>
        <input
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search phones, coffee, kitenge, TVs…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls="search-suggestions"
          className="h-11 w-full rounded-full border-0 bg-white pr-14 pl-5 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-accent-400 focus:outline-none"
        />
        <button type="submit" className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-accent-500 text-white hover:bg-accent-600" aria-label="Search">
          <Search className="size-4" />
        </button>
      </form>
      {open && options.length > 0 && (
        <ul id="search-suggestions" role="listbox" className="animate-fade-in absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl bg-white py-2 shadow-pop ring-1 ring-slate-900/5">
          {options.map((o, i) => (
            <li key={`${o.type}-${o.to}`} role="option" aria-selected={active === i}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(o.to)}
                className={cx('flex w-full items-center gap-3 px-4 py-2 text-left text-sm', active === i ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                {o.type === 'product' ? (
                  <ProductImage src={o.image} alt="" className="size-10 shrink-0 rounded-md" />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                    <LayoutGrid className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-800">{o.label}</span>
                  <span className="text-xs text-slate-500">{o.type === 'category' ? 'Category' : money(o.price)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
