import { Navigate, Route, Routes, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Bell, Boxes, LayoutDashboard, LifeBuoy, Package, Settings, Star, Wallet, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PortalLayout } from '../../layouts/PortalLayout.jsx';
import { Alert, Button } from '../../components/ui/index.jsx';
import { TicketList, TicketThread } from '../../components/shared/Support.jsx';
import { NotificationsPanel } from '../../components/shared/NotificationsPanel.jsx';
import Dashboard from './Dashboard.jsx';
import Onboarding from './Onboarding.jsx';
import Products from './Products.jsx';
import ProductForm from './ProductForm.jsx';
import Inventory from './Inventory.jsx';
import Orders from './Orders.jsx';
import OrderDetail from './OrderDetail.jsx';
import Analytics from './Analytics.jsx';
import Finance from './Finance.jsx';
import Reviews from './Reviews.jsx';
import ShopSettings from './ShopSettings.jsx';

export function useSellerOverview() {
  return useQuery({ queryKey: ['seller', 'overview'], queryFn: () => api('/seller/overview'), staleTime: 30_000 });
}

function StatusBanner({ overview }) {
  if (!overview) return null;
  const { profile, shop } = overview;
  const status = profile?.status ?? 'DRAFT';
  if (status === 'APPROVED' && shop?.status === 'ACTIVE') {
    if (shop.vacationMode || !shop.isOpen) {
      return (
        <Alert className="mb-6" tone="warning" title="Your shop is closed to new orders" action={<Button size="sm" variant="outline" to="/seller/settings?tab=availability">Reopen shop</Button>}>
          Buyers can see your products but cannot order until you reopen.
        </Alert>
      );
    }
    return null;
  }
  const content = {
    DRAFT: ['info', 'Finish setting up your shop', 'Complete the steps to submit your shop for review.', <Button key="b" size="sm" to="/seller/onboarding">Continue setup</Button>],
    PENDING: ['info', 'Your shop is under review', 'We usually review new shops within one business day. You can add products as drafts meanwhile.', null],
    REJECTED: ['warning', 'Your application needs changes', profile?.reviewNote ? `Reviewer note: ${profile.reviewNote}` : 'Update your details and resubmit.', <Button key="b" size="sm" to="/seller/onboarding">Update & resubmit</Button>],
    SUSPENDED: ['error', 'Your shop is suspended', `${profile?.reviewNote ?? 'Your products are hidden from buyers.'} Contact support to resolve this.`, <Button key="b" size="sm" variant="outline" to="/seller/support">Contact support</Button>],
  }[status];
  if (!content) return null;
  const [tone, title, text, action] = content;
  return (
    <Alert className="mb-6" tone={tone} title={title} action={action}>
      {text}
    </Alert>
  );
}

export default function SellerApp() {
  const { data: overview } = useSellerOverview();
  const { data: counts } = useQuery({
    queryKey: ['seller', 'orders', 'tabs'],
    queryFn: () => api('/seller/orders', { query: { tab: 'new', pageSize: 1 } }),
    enabled: Boolean(overview?.shop),
    refetchInterval: 30_000,
  });
  const newOrders = counts?.tabs?.new;
  const hasShop = Boolean(overview?.shop);

  const sections = [
    {
      items: [
        { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/seller/orders', label: 'Orders', icon: ClipboardList, badge: newOrders },
        { to: '/seller/products', label: 'Products', icon: Package },
        { to: '/seller/inventory', label: 'Inventory', icon: Boxes },
      ],
    },
    {
      title: 'Business',
      items: [
        { to: '/seller/analytics', label: 'Sales reports', icon: BarChart3 },
        { to: '/seller/finance', label: 'Earnings & payouts', icon: Wallet },
        { to: '/seller/reviews', label: 'Reviews', icon: Star },
      ],
    },
    {
      title: 'Shop',
      items: [
        { to: '/seller/settings', label: 'Shop settings', icon: Settings },
        { to: '/seller/support', label: 'Support', icon: LifeBuoy },
        { to: '/seller/notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ];

  return (
    <Routes>
      <Route
        element={
          <PortalLayout
            subtitle="Seller Center"
            home="/seller"
            sections={sections}
            notificationsLink="/seller/notifications"
            storefrontLink={overview?.shop?.status === 'ACTIVE' ? `/shop/${overview.shop.slug}` : '/'}
            banner={<StatusBanner overview={overview} />}
          />
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="products" element={hasShop ? <Products /> : <NeedsShop />} />
        <Route path="products/new" element={hasShop ? <ProductForm /> : <NeedsShop />} />
        <Route path="products/:id" element={hasShop ? <ProductForm /> : <NeedsShop />} />
        <Route path="inventory" element={hasShop ? <Inventory /> : <NeedsShop />} />
        <Route path="orders" element={hasShop ? <Orders /> : <NeedsShop />} />
        <Route path="orders/:id" element={hasShop ? <OrderDetail /> : <NeedsShop />} />
        <Route path="analytics" element={hasShop ? <Analytics /> : <NeedsShop />} />
        <Route path="finance" element={hasShop ? <Finance /> : <NeedsShop />} />
        <Route path="reviews" element={hasShop ? <Reviews /> : <NeedsShop />} />
        <Route path="settings" element={<ShopSettings />} />
        <Route path="support" element={<TicketList basePath="/seller/support" seller />} />
        <Route path="support/:id" element={<TicketThread basePath="/seller/support" />} />
        <Route path="notifications" element={<NotificationsPanel />} />
        <Route path="*" element={<Navigate to="/seller" replace />} />
      </Route>
    </Routes>
  );
}

function NeedsShop() {
  const { isLoading } = useSellerOverview();
  if (isLoading) return null;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-semibold">Create your shop first</p>
      <p className="mt-1 text-sm text-slate-500">It only takes a few minutes.</p>
      <Link to="/seller/onboarding" className="mt-4 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white">Set up my shop</Link>
    </div>
  );
}
