import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ExternalLink, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo } from '../components/Logo.jsx';
import { NotificationBell } from '../components/NotificationBell.jsx';
import { IconButton, cx } from '../components/ui/index.jsx';

/**
 * Sidebar layout shared by the seller, admin and delivery portals.
 * sections: [{ title?, items: [{ to, label, icon, end?, badge? }] }]
 */
export function PortalLayout({ subtitle, sections, home, notificationsLink, banner, storefrontLink = '/' }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label={`${subtitle} navigation`}>
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{section.title}</p>}
          <ul className="space-y-0.5">
            {section.items.map(({ to, label, icon: Icon, end, badge }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
                  }
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge ? <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{badge}</span> : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebarFooter = (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{user?.name?.[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>
        <IconButton label="Sign out" icon={LogOut} onClick={logout} className="size-8 text-slate-500 hover:bg-slate-100 hover:text-red-600" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <Logo to={home} subtitle={subtitle} />
        </div>
        {nav}
        {sidebarFooter}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="animate-fade-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-pop">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
              <Logo to={home} subtitle={subtitle} />
              <IconButton label="Close menu" icon={X} onClick={() => setOpen(false)} className="text-slate-500 hover:bg-slate-100" />
            </div>
            {nav}
            {sidebarFooter}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <IconButton label="Open menu" icon={Menu} onClick={() => setOpen(true)} className="-ml-2 text-slate-600 hover:bg-slate-100 lg:hidden" />
          <div className="lg:hidden">
            <Logo to={home} />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Link to={storefrontLink} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:flex">
              <ExternalLink className="size-4" /> View storefront
            </Link>
            <NotificationBell allLink={notificationsLink} className="text-slate-600 hover:bg-slate-100" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {banner}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
