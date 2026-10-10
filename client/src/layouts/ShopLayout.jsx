import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, ChevronRight, Heart, LayoutDashboard, LayoutGrid, LogOut, Mail, MapPin, Menu, MessageCircle, Package, Phone, Settings,
  ShieldCheck, ShoppingCart, Store, Truck, User, X, RotateCcw, BadgeCheck,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { SearchBar } from '../components/SearchBar.jsx';
import { CategoryIcon } from '../components/CategoryIcon.jsx';
import { NotificationBell } from '../components/NotificationBell.jsx';
import { IconButton, cx } from '../components/ui/index.jsx';

function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api('/categories'), staleTime: 5 * 60_000 });
}

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => !ref.current?.contains(e.target) && onOutside();
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside]);
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  if (!user) {
    return (
      <Link to="/login" className="flex items-center gap-2 rounded-full px-3 py-2 text-white hover:bg-white/10">
        <User className="size-5" />
        <span className="hidden text-left text-xs leading-tight lg:block">
          <span className="block text-brand-100">Hello, sign in</span>
          <span className="font-semibold">Account</span>
        </span>
      </Link>
    );
  }
  const isBuyer = user.role === 'BUYER';
  const links = isBuyer
    ? [
        { to: '/account/orders', label: 'My orders', icon: Package },
        { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
        { to: '/account/addresses', label: 'Addresses', icon: MapPin },
        { to: '/account/settings', label: 'Account settings', icon: Settings },
      ]
    : [{ to: homeFor(user), label: user.role === 'SELLER' ? 'Seller Center' : user.role === 'ADMIN' ? 'Admin dashboard' : 'Delivery app', icon: LayoutDashboard }];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full px-3 py-2 text-white hover:bg-white/10" aria-expanded={open} aria-haspopup="menu">
        <span className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{user.name[0]?.toUpperCase()}</span>
        <span className="hidden text-left text-xs leading-tight lg:block">
          <span className="block text-brand-100">Hello,</span>
          <span className="font-semibold">{user.name.split(' ')[0]}</span>
        </span>
        <ChevronDown className="hidden size-4 lg:block" />
      </button>
      {open && (
        <div role="menu" className="animate-fade-in absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl bg-white py-2 text-slate-800 shadow-pop ring-1 ring-slate-900/5">
          <div className="border-b border-slate-100 px-4 pb-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          {links.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50">
              <Icon className="size-4 text-slate-500" /> {label}
            </Link>
          ))}
          <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MegaMenu({ categories }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const location = useLocation();
  useClickOutside(ref, () => setOpen(false));
  useEffect(() => {
    setOpen(false);
  }, [location]);
  const current = categories?.[active];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-white/10" aria-expanded={open}>
        <LayoutGrid className="size-4" /> All categories <ChevronDown className="size-4" />
      </button>
      {open && categories && (
        <div className="animate-fade-in absolute left-0 z-50 mt-1 flex w-[640px] overflow-hidden rounded-xl bg-white text-slate-800 shadow-pop ring-1 ring-slate-900/5">
          <ul className="w-60 shrink-0 border-r border-slate-100 py-2">
            {categories.map((c, i) => (
              <li key={c.id}>
                <Link
                  to={`/search?category=${c.slug}`}
                  onMouseEnter={() => setActive(i)}
                  className={cx('flex items-center gap-3 px-4 py-2 text-sm', active === i ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50')}
                >
                  <CategoryIcon name={c.icon} className="size-4" />
                  <span className="flex-1">{c.name}</span>
                  {c.children.length > 0 && <ChevronRight className="size-4 text-slate-400" />}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex-1 p-5">
            {current && (
              <>
                <Link to={`/search?category=${current.slug}`} className="text-base font-bold text-slate-900 hover:text-brand-700">
                  {current.name}
                </Link>
                {current.description && <p className="mt-1 text-sm text-slate-500">{current.description}</p>}
                <ul className="mt-4 grid grid-cols-2 gap-2">
                  {current.children.map((child) => (
                    <li key={child.id}>
                      <Link to={`/search?category=${child.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                        <CategoryIcon name={child.icon} className="size-4 text-brand-600" />
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to={`/search?category=${current.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                  Shop all {current.name} <ChevronRight className="size-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileDrawer({ open, onClose, categories }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  useEffect(() => {
    onClose();
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] lg:hidden">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <aside className="animate-fade-in absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-white shadow-pop" aria-label="Menu">
        <div className="flex items-center justify-between bg-brand-800 px-4 py-4 text-white">
          <span className="font-semibold">{user ? `Hello, ${user.name.split(' ')[0]}` : 'Welcome'}</span>
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded p-1 hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <p className="px-4 pt-2 pb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">Shop by category</p>
          {categories?.map((c) => (
            <Link key={c.id} to={`/search?category=${c.slug}`} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <CategoryIcon name={c.icon} className="size-4 text-brand-600" /> {c.name}
            </Link>
          ))}
          <p className="mt-2 border-t border-slate-100 px-4 pt-4 pb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">Your account</p>
          {user ? (
            <>
              {user.role === 'BUYER' ? (
                <>
                  <Link to="/account/orders" className="block px-4 py-2.5 text-sm hover:bg-slate-50">My orders</Link>
                  <Link to="/account/wishlist" className="block px-4 py-2.5 text-sm hover:bg-slate-50">Wishlist</Link>
                  <Link to="/account/support" className="block px-4 py-2.5 text-sm hover:bg-slate-50">Help & support</Link>
                  <Link to="/account/settings" className="block px-4 py-2.5 text-sm hover:bg-slate-50">Settings</Link>
                </>
              ) : (
                <Link to={homeFor(user)} className="block px-4 py-2.5 text-sm hover:bg-slate-50">Go to my dashboard</Link>
              )}
              <button type="button" onClick={logout} className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="block px-4 py-2.5 text-sm hover:bg-slate-50">Sign in</Link>
              <Link to="/register" className="block px-4 py-2.5 text-sm hover:bg-slate-50">Create account</Link>
              <Link to="/sell" className="block px-4 py-2.5 text-sm hover:bg-slate-50">Sell on Rivoshoppa</Link>
            </>
          )}
        </nav>
      </aside>
    </div>
  );
}

export function ShopLayout() {
  const { user } = useAuth();
  const { count } = useCart();
  const config = useConfig();
  const { data } = useCategories();
  const [drawer, setDrawer] = useState(false);
  const categories = data?.items;
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-3">
        Skip to content
      </a>
      {config.announcementBar && (
        <div className="bg-brand-950 px-4 py-1.5 text-center text-xs font-medium text-brand-100">
          <Truck className="mr-1.5 inline size-3.5 align-[-2px] text-accent-400" />
          {config.announcementBar}
        </div>
      )}
      <header className="sticky top-0 z-40 bg-brand-800 text-white shadow-md">
        <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
          <IconButton label="Open menu" icon={Menu} onClick={() => setDrawer(true)} className="-ml-2 text-white hover:bg-white/10 lg:hidden" />
          <Logo inverted />
          <SearchBar className="mx-2 hidden flex-1 md:block lg:mx-6" />
          <nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {!user && (
              <Link to="/sell" className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/10 xl:flex">
                <Store className="size-4" /> Sell
              </Link>
            )}
            {user && user.role !== 'BUYER' && (
              <Link to={homeFor(user)} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/10 sm:flex">
                <LayoutDashboard className="size-4" /> Dashboard
              </Link>
            )}
            <AccountMenu />
            {user?.role === 'BUYER' && (
              <>
                <Link to="/account/wishlist" aria-label="Wishlist" className="hidden size-10 items-center justify-center rounded-full hover:bg-white/10 sm:flex">
                  <Heart className="size-5" />
                </Link>
                <NotificationBell allLink="/account/notifications" className="text-white hover:bg-white/10" />
              </>
            )}
            <Link to="/cart" aria-label={`Cart, ${count} items`} className="relative flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10">
              <ShoppingCart className="size-6" />
              {count > 0 && (
                <span className="absolute top-0.5 left-6 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold ring-2 ring-brand-800">
                  {count > 99 ? '99+' : count}
                </span>
              )}
              <span className="hidden text-sm font-semibold lg:block">Cart</span>
            </Link>
          </nav>
        </div>
        <div className="container-page pb-3 md:hidden">
          <SearchBar />
        </div>
        <div className="hidden bg-brand-700 lg:block">
          <div className="container-page flex h-11 items-center gap-1 text-sm">
            <MegaMenu categories={categories} />
            <div className="scrollbar-none flex items-center gap-1 overflow-x-auto">
              <NavLink to="/search?onSale=true" className="rounded-md px-3 py-2 font-semibold text-accent-200 hover:bg-white/10">
                Deals
              </NavLink>
              {categories?.slice(0, 7).map((c) => (
                <Link key={c.id} to={`/search?category=${c.slug}`} className="rounded-md px-3 py-2 whitespace-nowrap text-brand-50 hover:bg-white/10">
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </header>
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} categories={categories} />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-12 bg-brand-950 text-brand-100">
        <div className="border-b border-white/10">
          <div className="container-page grid gap-4 py-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              [ShieldCheck, 'Secure payments', 'MTN MoMo, Airtel Money & cash'],
              [BadgeCheck, 'Verified sellers', 'Every shop is reviewed'],
              [Truck, 'Tracked delivery', 'Follow every shipment'],
              [RotateCcw, 'Easy refunds', `${config.refundWindowDays}-day refund window`],
            ].map(([Icon, title, sub]) => (
              <div key={title} className="flex items-center gap-3">
                <Icon className="size-8 shrink-0 text-accent-400" />
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-xs text-brand-200">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="container-page grid gap-8 py-10 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo inverted />
            <p className="mt-3 max-w-sm text-brand-200">Rwanda’s marketplace for trusted local sellers — electronics, home, fashion, groceries and more, delivered to your door.</p>
            <div className="mt-4 space-y-1.5 text-brand-200">
              <a href="tel:+250783867068" className="flex items-center gap-2 hover:text-white"><Phone className="size-4" /> {config.supportPhone}</a>
              <a href="https://wa.me/250783867068" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white"><MessageCircle className="size-4" /> WhatsApp</a>
              <a href={`mailto:${config.supportEmail}`} className="flex items-center gap-2 hover:text-white"><Mail className="size-4" /> {config.supportEmail}</a>
            </div>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Customer service</p>
            <ul className="space-y-2">
              <li><Link to="/pages/help" className="hover:text-white">Help center</Link></li>
              <li><Link to="/pages/returns" className="hover:text-white">Returns & refunds</Link></li>
              <li><Link to="/pages/shipping" className="hover:text-white">Delivery information</Link></li>
              <li><Link to="/account/support" className="hover:text-white">Contact support</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Sell with us</p>
            <ul className="space-y-2">
              <li><Link to="/sell" className="hover:text-white">Sell on Rivoshoppa</Link></li>
              <li><Link to="/register/seller" className="hover:text-white">Open a shop</Link></li>
              <li><Link to="/login" className="hover:text-white">Seller sign in</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Rivoshoppa</p>
            <ul className="space-y-2">
              <li><Link to="/pages/about" className="hover:text-white">About us</Link></li>
              <li><Link to="/pages/terms" className="hover:text-white">Terms of service</Link></li>
              <li><Link to="/pages/privacy" className="hover:text-white">Privacy policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-brand-300 sm:flex-row">
            <p>© {new Date().getFullYear()} Rivoshoppa. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-2">
              {['MTN MoMo', 'Airtel Money', 'Cash on delivery'].map((m) => (
                <span key={m} className="rounded-md bg-white/10 px-2 py-1 font-semibold text-white">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
