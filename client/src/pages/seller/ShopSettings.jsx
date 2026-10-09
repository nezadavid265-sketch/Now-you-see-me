import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS } from '../../lib/format.js';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { SingleImageUpload } from '../../components/ImageUploader.jsx';
import { PasswordCard, ProfileCard, NotificationPrefsCard } from '../../components/shared/AccountSecurity.jsx';
import { Alert, Button, Card, CardHeader, Input, PageHeader, PageLoader, Select, Tabs, Textarea, Toggle } from '../../components/ui/index.jsx';
import { useSellerOverview } from './SellerApp.jsx';

function ShopProfile({ shop }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    name: shop.name,
    description: shop.description ?? '',
    logoUrl: shop.logoUrl,
    bannerUrl: shop.bannerUrl,
    email: shop.email ?? '',
    phone: shop.phone ?? '',
    city: shop.city ?? '',
    address: shop.address ?? '',
  });
  const onSubmit = form.submit(async (v) => {
    await api('/seller/shop', { method: 'PATCH', body: { ...v, email: v.email || null, phone: v.phone || null } });
    queryClient.invalidateQueries({ queryKey: ['seller'] });
    toast.success('Shop profile saved');
  });
  return (
    <Card>
      <CardHeader title="Shop profile" description="How your shop appears to buyers." />
      <form onSubmit={onSubmit} className="space-y-5">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
          <SingleImageUpload label="Logo" purpose="shop" value={form.values.logoUrl} onChange={(url) => form.set('logoUrl', url)} />
          <SingleImageUpload label="Banner" purpose="shop" value={form.values.bannerUrl} onChange={(url) => form.set('bannerUrl', url)} aspect="aspect-[4/1]" />
        </div>
        <Input label="Shop name" required maxLength={60} {...form.field('name')} />
        <Textarea label="About your shop" rows={4} maxLength={2000} {...form.field('description')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="City" {...form.field('city')} />
          <Input label="Pickup address" {...form.field('address')} />
          <Input label="Phone" type="tel" {...form.field('phone')} />
          <Input label="Email" type="email" {...form.field('email')} />
        </div>
        <div className="flex justify-end"><Button type="submit" loading={form.submitting}>Save</Button></div>
      </form>
    </Card>
  );
}

function Availability({ shop }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({ vacationMessage: shop.vacationMessage ?? '' });
  const save = async (patch) => {
    try {
      await api('/seller/shop/availability', { method: 'PATCH', body: patch });
      queryClient.invalidateQueries({ queryKey: ['seller'] });
      toast.success('Availability updated');
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <Card>
      <CardHeader title="Availability" description="Pause orders when you can’t fulfil them — your products stay visible." />
      <div className="space-y-5">
        <Toggle label="Shop is open for orders" description="Turn off to stop new orders immediately." checked={shop.isOpen} onChange={(isOpen) => save({ isOpen })} />
        <Toggle label="Vacation mode" description="Show a message to buyers and pause orders while you’re away." checked={shop.vacationMode} onChange={(vacationMode) => save({ vacationMode, vacationMessage: form.values.vacationMessage || null })} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input className="flex-1" label="Message for buyers" placeholder="e.g. Back on 15 October — orders resume then!" maxLength={200} {...form.field('vacationMessage')} />
          <Button variant="outline" onClick={() => save({ vacationMessage: form.values.vacationMessage || null })}>Save message</Button>
        </div>
      </div>
    </Card>
  );
}

function BusinessDetails({ profile }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    businessName: profile.businessName,
    businessType: profile.businessType,
    registrationNumber: profile.registrationNumber ?? '',
    businessAddress: profile.businessAddress,
    businessPhone: profile.businessPhone,
    businessEmail: profile.businessEmail ?? '',
    payoutMethod: profile.payoutMethod,
    payoutAccountName: profile.payoutAccountName ?? '',
    payoutAccountNumber: profile.payoutAccountNumber ?? '',
  });
  const onSubmit = form.submit(async (v) => {
    await api('/seller/profile', { method: 'PUT', body: { ...v, registrationNumber: v.registrationNumber || null, businessEmail: v.businessEmail || null } });
    queryClient.invalidateQueries({ queryKey: ['seller'] });
    toast.success('Business details saved');
  });
  return (
    <Card>
      <CardHeader title="Business & payouts" description="Changes to payout details are recorded for your security." />
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" required {...form.field('businessName')} />
          <Select label="Type" {...form.field('businessType')} options={[{ value: 'INDIVIDUAL', label: 'Individual' }, { value: 'COMPANY', label: 'Company' }, { value: 'COOPERATIVE', label: 'Cooperative' }]} />
          <Input label="TIN / registration number" {...form.field('registrationNumber')} />
          <Input label="Business phone" required {...form.field('businessPhone')} />
          <Input label="Business email" type="email" {...form.field('businessEmail')} />
          <Input label="Business address" required {...form.field('businessAddress')} />
        </div>
        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <Select label="Payout method" {...form.field('payoutMethod')} options={['MTN_MOMO', 'AIRTEL_MONEY', 'BANK_TRANSFER'].map((m) => ({ value: m, label: PAYMENT_METHODS[m] }))} />
          <Input label="Account name" {...form.field('payoutAccountName')} />
          <Input label="Account / phone number" {...form.field('payoutAccountNumber')} />
        </div>
        <div className="flex justify-end"><Button type="submit" loading={form.submitting}>Save</Button></div>
      </form>
    </Card>
  );
}

export default function ShopSettings() {
  usePageTitle('Shop settings');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'profile';
  const { data, isLoading } = useSellerOverview();
  useEffect(() => {
    if (data && !data.shop && tab !== 'account') setParams({ tab: 'account' }, { replace: true });
  }, [data, tab, setParams]);
  if (isLoading) return <PageLoader />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          ...(data.shop ? [{ value: 'profile', label: 'Shop profile' }, { value: 'availability', label: 'Availability' }] : []),
          ...(data.profile ? [{ value: 'business', label: 'Business & payouts' }] : []),
          { value: 'account', label: 'My account' },
        ]}
      />
      {tab === 'profile' && data.shop && <ShopProfile shop={data.shop} />}
      {tab === 'availability' && data.shop && <Availability shop={data.shop} />}
      {tab === 'business' && data.profile && <BusinessDetails profile={data.profile} />}
      {tab === 'account' && (
        <>
          <ProfileCard />
          <NotificationPrefsCard />
          <PasswordCard />
        </>
      )}
    </div>
  );
}
