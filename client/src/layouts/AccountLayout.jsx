import { NavLink, Outlet } from 'react-router';
import { Bell, Heart, LayoutDashboard, LifeBuoy, MapPin, Package, RotateCcw, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { EmailVerificationBanner } from '../components/shared/AccountSecurity.jsx';
import { cx } from '../components/ui/index.jsx';

const LINKS = [
  { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/account/orders', label: 'Orders', icon: Package },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/refunds', label: 'Refunds', icon: RotateCcw },
  { to: '/account/support', label: 'Help & support', icon: LifeBuoy },
  { to: '/account/notifications', label: 'Notifications', icon: Bell },
  { to: '/account/settings', label: 'Settings', icon: Settings },
];

export function AccountLayout() {
  const { user } = useAuth();
  return (
    <div className="container-page py-6 lg:py-10">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:gap-10">
        <aside>
          <div className="mb-4 hidden lg:block">
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="truncate font-semibold text-slate-900">{user?.name}</p>
          </div>
          <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Account">
            {LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-white hover:text-slate-900',
                  )
                }
              >
                <Icon className="size-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 space-y-6">
          <EmailVerificationBanner />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
