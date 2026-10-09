import { Navigate, Route, Routes } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Bell, Boxes, ClipboardList, CreditCard, FileText, FolderTree, Image, LayoutDashboard, LifeBuoy, Megaphone,
  Package, Percent, Receipt, RotateCcw, Settings, ShieldCheck, Star, Store, Truck, UserCog, Users, Wallet,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PortalLayout } from '../../layouts/PortalLayout.jsx';
import { RequireRole } from '../../components/Guards.jsx';
import { NotificationsPanel } from '../../components/shared/NotificationsPanel.jsx';
import Dashboard from './Dashboard.jsx';
import { UserDetail, UsersList, StaffPage } from './Users.jsx';
import { SellerDetail, SellersList, ShopsList } from './Sellers.jsx';
import { CategoriesPage, ProductsModeration, ReviewsModeration } from './Catalog.jsx';
import { AdminOrderDetail, AdminOrders, DeliveriesPage } from './Orders.jsx';
import { PaymentsPage, PayoutsPage, RefundsPage } from './Finance.jsx';
import { BannersPage, CouponsPage } from './Marketing.jsx';
import { AnnouncementsPage, PagesPage } from './Content.jsx';
import { TicketDetail, TicketsList } from './Support.jsx';
import { AuditLogPage, ReportsPage, SecurityPage, SettingsPage } from './System.jsx';

const guard = (permission, element) => <RequireRole roles={['ADMIN']} permission={permission}>{element}</RequireRole>;

export default function AdminApp() {
  const { can } = useAuth();
  const { data: dash } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api('/admin/dashboard'), refetchInterval: 60_000 });
  const p = dash?.pending ?? {};

  const sections = [
    { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      title: 'Marketplace',
      items: [
        can('sellers') && { to: '/admin/sellers', label: 'Sellers', icon: Store, badge: p.sellerApplications },
        can('sellers') && { to: '/admin/shops', label: 'Shops', icon: Boxes },
        can('catalog') && { to: '/admin/products', label: 'Products', icon: Package, badge: p.productReviews },
        can('catalog') && { to: '/admin/categories', label: 'Categories', icon: FolderTree },
        can('catalog') && { to: '/admin/reviews', label: 'Reviews', icon: Star },
      ].filter(Boolean),
    },
    {
      title: 'Operations',
      items: [
        can('orders') && { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
        can('orders') && { to: '/admin/deliveries', label: 'Deliveries', icon: Truck, badge: p.unassignedDeliveries },
        can('support') && { to: '/admin/tickets', label: 'Support tickets', icon: LifeBuoy, badge: p.tickets },
      ].filter(Boolean),
    },
    {
      title: 'Finance',
      items: [
        can('finance') && { to: '/admin/payments', label: 'Payments', icon: CreditCard },
        can('finance') && { to: '/admin/refunds', label: 'Refunds', icon: RotateCcw, badge: p.refunds },
        can('finance') && { to: '/admin/payouts', label: 'Payouts & commissions', icon: Wallet },
      ].filter(Boolean),
    },
    {
      title: 'People',
      items: [
        can('users') && { to: '/admin/users', label: 'Users', icon: Users },
        can('users') && { to: '/admin/staff', label: 'Staff & couriers', icon: UserCog },
      ].filter(Boolean),
    },
    {
      title: 'Growth & content',
      items: [
        can('marketing') && { to: '/admin/coupons', label: 'Promo codes', icon: Percent },
        can('marketing') && { to: '/admin/banners', label: 'Banners', icon: Image },
        can('content') && { to: '/admin/pages', label: 'Pages', icon: FileText },
        can('content') && { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
      ].filter(Boolean),
    },
    {
      title: 'System',
      items: [
        can('reports') && { to: '/admin/reports', label: 'Reports', icon: Receipt },
        can('audit') && { to: '/admin/audit', label: 'Audit log', icon: Activity },
        can('audit') && { to: '/admin/security', label: 'Security', icon: ShieldCheck },
        can('settings') && { to: '/admin/settings', label: 'Settings', icon: Settings },
        { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      ].filter(Boolean),
    },
  ].filter((s) => s.items.length);

  return (
    <Routes>
      <Route element={<PortalLayout subtitle="Admin" home="/admin" sections={sections} notificationsLink="/admin/notifications" />}>
        <Route index element={<Dashboard data={dash} />} />
        <Route path="sellers" element={guard('sellers', <SellersList />)} />
        <Route path="sellers/:id" element={guard('sellers', <SellerDetail />)} />
        <Route path="shops" element={guard('sellers', <ShopsList />)} />
        <Route path="products" element={guard('catalog', <ProductsModeration />)} />
        <Route path="categories" element={guard('catalog', <CategoriesPage />)} />
        <Route path="reviews" element={guard('catalog', <ReviewsModeration />)} />
        <Route path="orders" element={guard('orders', <AdminOrders />)} />
        <Route path="orders/:id" element={guard('orders', <AdminOrderDetail />)} />
        <Route path="deliveries" element={guard('orders', <DeliveriesPage />)} />
        <Route path="tickets" element={guard('support', <TicketsList />)} />
        <Route path="support/:id" element={guard('support', <TicketDetail />)} />
        <Route path="payments" element={guard('finance', <PaymentsPage />)} />
        <Route path="refunds" element={guard('finance', <RefundsPage />)} />
        <Route path="payouts" element={guard('finance', <PayoutsPage />)} />
        <Route path="users" element={guard('users', <UsersList />)} />
        <Route path="users/:id" element={guard('users', <UserDetail />)} />
        <Route path="staff" element={guard('users', <StaffPage />)} />
        <Route path="coupons" element={guard('marketing', <CouponsPage />)} />
        <Route path="banners" element={guard('marketing', <BannersPage />)} />
        <Route path="pages" element={guard('content', <PagesPage />)} />
        <Route path="announcements" element={guard('content', <AnnouncementsPage />)} />
        <Route path="reports" element={guard('reports', <ReportsPage />)} />
        <Route path="audit" element={guard('audit', <AuditLogPage />)} />
        <Route path="security" element={guard('audit', <SecurityPage />)} />
        <Route path="settings" element={guard('settings', <SettingsPage />)} />
        <Route path="notifications" element={<NotificationsPanel />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
