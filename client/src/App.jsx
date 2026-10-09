import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ShopLayout } from './layouts/ShopLayout.jsx';
import { AccountLayout } from './layouts/AccountLayout.jsx';
import { AuthLayout } from './layouts/AuthLayout.jsx';
import { GuestOnly, RequireRole } from './components/Guards.jsx';
import { PageLoader } from './components/ui/index.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

import Home from './pages/shop/Home.jsx';
import Search from './pages/shop/Search.jsx';
import Product from './pages/shop/Product.jsx';
import ShopPage from './pages/shop/ShopPage.jsx';
import Cart from './pages/shop/Cart.jsx';
import ContentPage from './pages/shop/ContentPage.jsx';
import SellLanding from './pages/shop/SellLanding.jsx';
import NotFound from './pages/shop/NotFound.jsx';
import { Login, Register, RegisterSeller, ForgotPassword, ResetPassword, VerifyEmail } from './pages/auth/AuthPages.jsx';

// Checkout & account pages
const Checkout = lazy(() => import('./pages/shop/Checkout.jsx'));
const PaymentStatus = lazy(() => import('./pages/shop/PaymentStatus.jsx'));
const OrderSuccess = lazy(() => import('./pages/shop/OrderSuccess.jsx'));
const AccountPages = {
  Overview: lazy(() => import('./pages/account/Overview.jsx')),
  Orders: lazy(() => import('./pages/account/Orders.jsx')),
  OrderDetail: lazy(() => import('./pages/account/OrderDetail.jsx')),
  Wishlist: lazy(() => import('./pages/account/Wishlist.jsx')),
  Addresses: lazy(() => import('./pages/account/Addresses.jsx')),
  Refunds: lazy(() => import('./pages/account/Refunds.jsx')),
  Settings: lazy(() => import('./pages/account/Settings.jsx')),
  Support: lazy(() => import('./pages/account/Support.jsx').then((m) => ({ default: m.SupportList }))),
  Ticket: lazy(() => import('./pages/account/Support.jsx').then((m) => ({ default: m.SupportTicket }))),
  Notifications: lazy(() => import('./components/shared/NotificationsPanel.jsx').then((m) => ({ default: m.NotificationsPanel }))),
};

// Portals are split into their own bundles.
const SellerApp = lazy(() => import('./pages/seller/SellerApp.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));
const DeliveryApp = lazy(() => import('./pages/delivery/DeliveryApp.jsx'));

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<ShopLayout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="p/:slug" element={<Product />} />
            <Route path="shop/:slug" element={<ShopPage />} />
            <Route path="cart" element={<Cart />} />
            <Route path="pages/:slug" element={<ContentPage />} />
            <Route path="sell" element={<SellLanding />} />
            <Route path="checkout" element={<RequireRole roles={['BUYER']}><Checkout /></RequireRole>} />
            <Route path="checkout/payment/:orderId" element={<RequireRole roles={['BUYER']}><PaymentStatus /></RequireRole>} />
            <Route path="checkout/success/:orderId" element={<RequireRole roles={['BUYER']}><OrderSuccess /></RequireRole>} />
            <Route path="account" element={<RequireRole roles={['BUYER']}><AccountLayout /></RequireRole>}>
              <Route index element={<AccountPages.Overview />} />
              <Route path="orders" element={<AccountPages.Orders />} />
              <Route path="orders/:id" element={<AccountPages.OrderDetail />} />
              <Route path="wishlist" element={<AccountPages.Wishlist />} />
              <Route path="addresses" element={<AccountPages.Addresses />} />
              <Route path="refunds" element={<AccountPages.Refunds />} />
              <Route path="support" element={<AccountPages.Support />} />
              <Route path="support/:id" element={<AccountPages.Ticket />} />
              <Route path="notifications" element={<AccountPages.Notifications />} />
              <Route path="settings" element={<AccountPages.Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route element={<AuthLayout />}>
            <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="register/seller" element={<GuestOnly><RegisterSeller /></GuestOnly>} />
            <Route path="forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="verify-email" element={<VerifyEmail />} />
          </Route>

          <Route path="seller/*" element={<RequireRole roles={['SELLER']}><SellerApp /></RequireRole>} />
          <Route path="admin/*" element={<RequireRole roles={['ADMIN']}><AdminApp /></RequireRole>} />
          <Route path="delivery/*" element={<RequireRole roles={['DELIVERY']}><DeliveryApp /></RequireRole>} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
