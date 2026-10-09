import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, money } from '../../lib/format.js';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { SingleImageUpload } from '../../components/ImageUploader.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Checkbox, Input, PageHeader, Select, cx } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// ── Coupons ────────────────────────────────────────────────────────

function CouponModal({ coupon, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    type: coupon?.type ?? 'PERCENTAGE',
    value: String(coupon?.value ?? ''),
    minOrderAmount: String(coupon?.minOrderAmount ?? 0),
    maxDiscount: coupon?.maxDiscount ? String(coupon.maxDiscount) : '',
    usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : '',
    perUserLimit: String(coupon?.perUserLimit ?? 1),
    startsAt: toInputDate(coupon?.startsAt),
    endsAt: toInputDate(coupon?.endsAt),
    isActive: coupon?.isActive ?? true,
  });
  const onSubmit = form.submit(async (v) => {
    const body = {
      code: v.code,
      description: v.description || null,
      type: v.type,
      value: Number(v.value),
      minOrderAmount: Number(v.minOrderAmount || 0),
      maxDiscount: v.maxDiscount ? Number(v.maxDiscount) : null,
      usageLimit: v.usageLimit ? Number(v.usageLimit) : null,
      perUserLimit: Number(v.perUserLimit || 0),
      startsAt: v.startsAt || null,
      endsAt: v.endsAt ? `${v.endsAt}T23:59:59` : null,
      isActive: v.isActive,
    };
    if (coupon) await api(`/admin/coupons/${coupon.id}`, { method: 'PATCH', body });
    else await api('/admin/coupons', { method: 'POST', body });
    queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    toast.success('Promo code saved');
    onClose();
  });
  return (
    <Modal open onClose={onClose} title={coupon ? `Edit ${coupon.code}` : 'New promo code'} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Code" required inputClassName="uppercase" {...form.field('code')} />
          <Input label="Description (shown to buyers)" {...form.field('description')} />
          <Select label="Discount type" {...form.field('type')} options={[{ value: 'PERCENTAGE', label: 'Percentage off' }, { value: 'FIXED', label: 'Fixed amount off (RWF)' }]} />
          <Input label={form.values.type === 'PERCENTAGE' ? 'Percent off' : 'Amount off (RWF)'} type="number" min={1} required {...form.field('value')} />
          <Input label="Minimum order (RWF)" type="number" min={0} {...form.field('minOrderAmount')} />
          <Input label="Maximum discount (RWF)" type="number" min={1} hint="Optional cap for percentages" {...form.field('maxDiscount')} />
          <Input label="Total uses allowed" type="number" min={1} hint="Empty = unlimited" {...form.field('usageLimit')} />
          <Input label="Uses per buyer" type="number" min={0} hint="0 = unlimited" {...form.field('perUserLimit')} />
          <Input label="Starts" type="date" {...form.field('startsAt')} />
          <Input label="Ends" type="date" {...form.field('endsAt')} />
        </div>
        <Checkbox label="Active" checked={form.values.isActive} onChange={(e) => form.set('isActive', e.target.checked)} />
      </form>
    </Modal>
  );
}

export function CouponsPage() {
  usePageTitle('Promo codes');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'coupons', page], queryFn: () => api('/admin/coupons', { query: { page } }) });
  const remove = async (c) => {
    const res = await api(`/admin/coupons/${c.id}`, { method: 'DELETE' });
    toast.success(res?.deactivated ? 'Code already used — it has been deactivated instead' : 'Promo code deleted');
    queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
  };
  return (
    <div>
      <PageHeader title="Promo codes" description="Marketplace-funded discounts. Validated on the server at checkout." actions={<Button icon={Plus} onClick={() => setEditing('new')}>New code</Button>} />
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={setPage}
        empty="No promo codes yet."
        columns={[
          { key: 'code', header: 'Code', render: (c) => <div><code className="font-bold">{c.code}</code><p className="text-xs text-slate-500">{c.description}</p></div> },
          { key: 'value', header: 'Discount', render: (c) => (c.type === 'PERCENTAGE' ? `${c.value}%${c.maxDiscount ? ` (max ${money(c.maxDiscount)})` : ''}` : money(c.value)) },
          { key: 'min', header: 'Min. order', hideOnMobile: true, render: (c) => (c.minOrderAmount ? money(c.minOrderAmount) : '—') },
          { key: 'used', header: 'Used', render: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` },
          { key: 'dates', header: 'Valid', hideOnMobile: true, render: (c) => <span className="text-xs">{c.startsAt ? date(c.startsAt) : 'Now'} → {c.endsAt ? date(c.endsAt) : 'No end'}</span> },
          { key: 'active', header: 'Status', render: (c) => (c.isActive && (!c.endsAt || new Date(c.endsAt) > new Date()) ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>) },
          { key: 'actions', header: '', render: (c) => <div className="flex gap-1"><Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(c)}>Edit</Button><Button size="xs" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => remove(c)} aria-label="Delete" /></div> },
        ]}
      />
      {editing && <CouponModal coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ── Banners ────────────────────────────────────────────────────────

const THEMES = {
  brand: 'from-brand-800 to-brand-500',
  accent: 'from-accent-600 to-amber-400',
  dark: 'from-slate-900 to-brand-900',
  sunrise: 'from-rose-700 to-amber-500',
  forest: 'from-emerald-900 to-lime-500',
};

function BannerModal({ banner, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    title: banner?.title ?? '',
    subtitle: banner?.subtitle ?? '',
    ctaLabel: banner?.ctaLabel ?? '',
    linkUrl: banner?.linkUrl ?? '',
    imageUrl: banner?.imageUrl ?? null,
    theme: banner?.theme ?? 'brand',
    position: banner?.position ?? 'HOME_HERO',
    sortOrder: String(banner?.sortOrder ?? 0),
    isActive: banner?.isActive ?? true,
    startsAt: toInputDate(banner?.startsAt),
    endsAt: toInputDate(banner?.endsAt),
  });
  const v = form.values;
  const onSubmit = form.submit(async () => {
    const body = { ...v, subtitle: v.subtitle || null, ctaLabel: v.ctaLabel || null, linkUrl: v.linkUrl || null, sortOrder: Number(v.sortOrder || 0), startsAt: v.startsAt || null, endsAt: v.endsAt ? `${v.endsAt}T23:59:59` : null };
    if (banner) await api(`/admin/banners/${banner.id}`, { method: 'PATCH', body });
    else await api('/admin/banners', { method: 'POST', body });
    queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
    queryClient.invalidateQueries({ queryKey: ['home'] });
    toast.success('Banner saved');
    onClose();
  });
  return (
    <Modal open onClose={onClose} title={banner ? 'Edit banner' : 'New banner'} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className={cx('relative overflow-hidden rounded-xl bg-gradient-to-r p-6 text-white', THEMES[v.theme])}>
          {v.imageUrl && <img src={v.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30 mix-blend-overlay" />}
          <p className="relative text-xl font-bold">{v.title || 'Banner title'}</p>
          <p className="relative text-sm text-white/85">{v.subtitle || 'Subtitle'}</p>
          {v.ctaLabel && <span className="relative mt-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-900">{v.ctaLabel}</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" required maxLength={80} {...form.field('title')} />
          <Input label="Subtitle" maxLength={160} {...form.field('subtitle')} />
          <Input label="Button label" maxLength={30} {...form.field('ctaLabel')} />
          <Input label="Link (within the site)" placeholder="/search?category=electronics" {...form.field('linkUrl')} />
          <Select label="Colour theme" {...form.field('theme')} options={Object.keys(THEMES).map((t) => ({ value: t, label: t }))} />
          <Select label="Position" {...form.field('position')} options={[{ value: 'HOME_HERO', label: 'Home — hero carousel' }, { value: 'HOME_STRIP', label: 'Home — promo strip' }]} />
          <Input label="Starts" type="date" {...form.field('startsAt')} />
          <Input label="Ends" type="date" {...form.field('endsAt')} />
          <Input label="Sort order" type="number" min={0} {...form.field('sortOrder')} />
        </div>
        <SingleImageUpload label="Background image (optional)" purpose="banner" value={v.imageUrl} onChange={(url) => form.set('imageUrl', url)} aspect="aspect-[4/1]" />
        <Checkbox label="Active" checked={v.isActive} onChange={(e) => form.set('isActive', e.target.checked)} />
      </form>
    </Modal>
  );
}

export function BannersPage() {
  usePageTitle('Banners');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'banners'], queryFn: () => api('/admin/banners') });
  return (
    <div>
      <PageHeader title="Banners" description="Promotional banners on the home page." actions={<Button icon={Plus} onClick={() => setEditing('new')}>New banner</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {data?.items.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <div className={cx('relative bg-gradient-to-r p-5 text-white', THEMES[b.theme] ?? THEMES.brand)}>
              {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30 mix-blend-overlay" />}
              <p className="relative font-bold">{b.title}</p>
              <p className="relative text-sm text-white/85">{b.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-slate-500">
              <span>{b.position === 'HOME_HERO' ? 'Hero' : 'Strip'} · #{b.sortOrder} · {b.linkUrl ?? 'no link'}</span>
              <div className="flex items-center gap-1">
                {b.isActive ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}
                <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(b)}>Edit</Button>
                <Button size="xs" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(b)} aria-label="Delete" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing && <BannerModal banner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete banner?" description={deleting?.title} tone="danger" confirmLabel="Delete" onConfirm={async () => { await api(`/admin/banners/${deleting.id}`, { method: 'DELETE' }); queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] }); }} />
    </div>
  );
}

