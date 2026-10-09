import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CircleCheck, Send, Store, Wallet } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS } from '../../lib/format.js';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { SingleImageUpload } from '../../components/ImageUploader.jsx';
import { Alert, Button, Card, Input, PageHeader, PageLoader, Select, Textarea, cx } from '../../components/ui/index.jsx';
import { useSellerOverview } from './SellerApp.jsx';

const STEPS = [
  { key: 'business', label: 'Business details', icon: Building2 },
  { key: 'shop', label: 'Your shop', icon: Store },
  { key: 'payout', label: 'Getting paid', icon: Wallet },
  { key: 'review', label: 'Submit', icon: Send },
];

function Stepper({ step }) {
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-col items-center gap-2 text-center">
          <span className={cx('flex size-10 items-center justify-center rounded-full', i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-700 text-white ring-4 ring-brand-100' : 'bg-slate-200 text-slate-500')}>
            {i < step ? <CircleCheck className="size-5" /> : <s.icon className="size-5" />}
          </span>
          <span className={cx('text-xs font-semibold sm:text-sm', i === step ? 'text-slate-900' : 'text-slate-500')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Onboarding() {
  usePageTitle('Shop setup');
  const { data, isLoading } = useSellerOverview();
  const { user, reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const profile = data?.profile;
  const shop = data?.shop;

  const business = useForm({});
  const shopForm = useForm({});
  const payout = useForm({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!data) return;
    business.setValues({
      businessName: profile?.businessName ?? '',
      businessType: profile?.businessType ?? 'INDIVIDUAL',
      registrationNumber: profile?.registrationNumber ?? '',
      businessAddress: profile?.businessAddress ?? '',
      businessPhone: profile?.businessPhone ?? user.phone ?? '',
      businessEmail: profile?.businessEmail ?? user.email,
    });
    shopForm.setValues({
      name: shop?.name ?? profile?.businessName ?? '',
      description: shop?.description ?? '',
      city: shop?.city ?? 'Kigali',
      address: shop?.address ?? '',
      phone: shop?.phone ?? user.phone ?? '',
      email: shop?.email ?? user.email,
      logoUrl: shop?.logoUrl ?? null,
    });
    payout.setValues({
      payoutMethod: profile?.payoutMethod ?? 'MTN_MOMO',
      payoutAccountName: profile?.payoutAccountName ?? user.name,
      payoutAccountNumber: profile?.payoutAccountNumber ?? user.phone ?? '',
    });
    if (profile && ['PENDING', 'APPROVED'].includes(profile.status)) setStep(3);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PageLoader />;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seller'] });

  const saveProfile = (values) =>
    api('/seller/profile', {
      method: 'PUT',
      body: {
        ...business.values,
        ...payout.values,
        ...values,
        registrationNumber: (values.registrationNumber ?? business.values.registrationNumber) || null,
        businessEmail: (values.businessEmail ?? business.values.businessEmail) || null,
      },
    });

  const onBusiness = business.submit(async (v) => {
    await saveProfile(v);
    await refresh();
    setStep(1);
  });
  const onShop = shopForm.submit(async (v) => {
    const body = { ...v, email: v.email || null, phone: v.phone || null };
    if (shop) await api('/seller/shop', { method: 'PATCH', body });
    else await api('/seller/shop', { method: 'POST', body });
    await refresh();
    setStep(2);
  });
  const onPayout = payout.submit(async (v) => {
    await saveProfile(v);
    await refresh();
    setStep(3);
  });
  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await api('/seller/submit', { method: 'POST' });
      await refresh();
      await reloadUser();
      toast.success('Submitted! We’ll notify you once your shop is reviewed.');
      navigate('/seller');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const status = profile?.status ?? 'DRAFT';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Set up your shop" description="Four short steps. You can come back and edit anything later." />
      <Stepper step={step} />

      {step === 0 && (
        <Card>
          <h2 className="text-lg font-semibold">Tell us about your business</h2>
          <p className="mb-5 text-sm text-slate-500">This information is only shared with the Rivoshoppa team for verification.</p>
          <form onSubmit={onBusiness} className="space-y-4">
            {business.formError && <Alert tone="error">{business.formError}</Alert>}
            <Input label="Business name" required hint="As registered, or your own name if you sell as an individual." {...business.field('businessName')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Type of business" {...business.field('businessType')} options={[{ value: 'INDIVIDUAL', label: 'Individual / sole trader' }, { value: 'COMPANY', label: 'Registered company' }, { value: 'COOPERATIVE', label: 'Cooperative' }]} />
              <Input label="TIN / registration number (optional)" hint="Helps us approve you faster." {...business.field('registrationNumber')} />
            </div>
            <Input label="Business address" required placeholder="Street, area, city" {...business.field('businessAddress')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Business phone" required type="tel" {...business.field('businessPhone')} />
              <Input label="Business email (optional)" type="email" {...business.field('businessEmail')} />
            </div>
            <div className="flex justify-end"><Button type="submit" loading={business.submitting}>Save & continue</Button></div>
          </form>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <h2 className="text-lg font-semibold">Create your shop</h2>
          <p className="mb-5 text-sm text-slate-500">This is what buyers see. A clear name and logo build trust.</p>
          <form onSubmit={onShop} className="space-y-4">
            {shopForm.formError && <Alert tone="error">{shopForm.formError}</Alert>}
            <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
              <SingleImageUpload label="Logo" purpose="shop" value={shopForm.values.logoUrl} onChange={(url) => shopForm.set('logoUrl', url)} />
              <div className="space-y-4">
                <Input label="Shop name" required maxLength={60} {...shopForm.field('name')} />
                <Textarea label="About your shop" rows={3} maxLength={2000} placeholder="What do you sell? What makes your shop special?" {...shopForm.field('description')} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="City" {...shopForm.field('city')} />
              <Input label="Pickup address" hint="Where couriers collect orders." {...shopForm.field('address')} />
              <Input label="Shop phone" type="tel" {...shopForm.field('phone')} />
              <Input label="Shop email" type="email" {...shopForm.field('email')} />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button type="submit" loading={shopForm.submitting}>Save & continue</Button>
            </div>
          </form>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 className="text-lg font-semibold">How should we pay you?</h2>
          <p className="mb-5 text-sm text-slate-500">Your earnings (minus commission) are sent here after each order is delivered and the refund window passes.</p>
          <form onSubmit={onPayout} className="space-y-4">
            {payout.formError && <Alert tone="error">{payout.formError}</Alert>}
            <Select label="Payout method" {...payout.field('payoutMethod')} options={['MTN_MOMO', 'AIRTEL_MONEY', 'BANK_TRANSFER'].map((m) => ({ value: m, label: PAYMENT_METHODS[m] }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Account holder name" required {...payout.field('payoutAccountName')} />
              <Input label={payout.values.payoutMethod === 'BANK_TRANSFER' ? 'Bank account number' : 'Mobile money number'} required {...payout.field('payoutAccountNumber')} />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button type="submit" loading={payout.submitting}>Save & continue</Button>
            </div>
          </form>
        </Card>
      )}

      {step === 3 && (
        <Card>
          {status === 'PENDING' ? (
            <div className="py-6 text-center">
              <CircleCheck className="mx-auto size-14 text-brand-600" />
              <h2 className="mt-3 text-xl font-semibold">Your shop is under review</h2>
              <p className="mt-1 text-sm text-slate-500">We’ll notify you by email and in the dashboard. Meanwhile you can add products as drafts.</p>
              <div className="mt-5 flex justify-center gap-2">
                <Button to="/seller/products/new">Add a product</Button>
                <Button variant="outline" onClick={() => setStep(0)}>Edit details</Button>
              </div>
            </div>
          ) : status === 'APPROVED' ? (
            <div className="py-6 text-center">
              <CircleCheck className="mx-auto size-14 text-emerald-500" />
              <h2 className="mt-3 text-xl font-semibold">Your shop is approved and live</h2>
              <div className="mt-5 flex justify-center gap-2">
                <Button to="/seller/products/new">Add a product</Button>
                <Button variant="outline" to="/seller/settings">Shop settings</Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Ready to submit</h2>
              <p className="mb-4 text-sm text-slate-500">Check your details, then send your shop for review.</p>
              {status === 'REJECTED' && profile?.reviewNote && <Alert className="mb-4" tone="warning" title="Changes requested">{profile.reviewNote}</Alert>}
              <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Business</dt><dd className="font-medium">{profile?.businessName}</dd></div>
                <div><dt className="text-slate-500">Shop</dt><dd className="font-medium">{shop?.name ?? '—'}</dd></div>
                <div><dt className="text-slate-500">Payout</dt><dd className="font-medium">{PAYMENT_METHODS[profile?.payoutMethod]} · {profile?.payoutAccountNumber ?? '—'}</dd></div>
                <div><dt className="text-slate-500">Phone</dt><dd className="font-medium">{profile?.businessPhone}</dd></div>
              </dl>
              {submitError && <Alert className="mt-4" tone="error">{submitError}</Alert>}
              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button icon={Send} loading={submitting} onClick={submit}>Submit for review</Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
