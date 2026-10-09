import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, bpsToPercent, date, dateTime, money, titleCase } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, CardHeader, DescriptionList, Input, PageHeader, PageLoader, Select, StatusBadge, Tabs } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

const DEFAULTS = { status: 'PENDING', q: '', page: '1' };

export function SellersList() {
  usePageTitle('Sellers');
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sellers', params],
    queryFn: () => api('/admin/sellers', { query: { ...params, status: params.status === 'ALL' ? undefined : params.status } }),
    placeholderData: (p) => p,
  });
  return (
    <div>
      <PageHeader title="Sellers" description="Review applications and manage seller accounts." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={params.status} onChange={(status) => update({ status })} tabs={[
          { value: 'PENDING', label: 'Awaiting review' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'SUSPENDED', label: 'Suspended' },
          { value: 'DRAFT', label: 'Incomplete' },
          { value: 'ALL', label: 'All' },
        ]} />
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex gap-2 lg:w-80">
          <Input aria-label="Search sellers" placeholder="Business, shop or email" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        onRowClick={(s) => navigate(`/admin/sellers/${s.id}`)}
        empty="No sellers in this list."
        columns={[
          { key: 'business', header: 'Business', render: (s) => <div><p className="font-medium text-slate-900">{s.businessName}</p><p className="text-xs text-slate-500">{titleCase(s.businessType)}{s.registrationNumber && ` · ${s.registrationNumber}`}</p></div> },
          { key: 'shop', header: 'Shop', render: (s) => s.user.shop?.name ?? <span className="text-slate-400">Not created</span> },
          { key: 'contact', header: 'Contact', hideOnMobile: true, render: (s) => <div className="text-xs"><p>{s.user.email}</p><p className="text-slate-500">{s.businessPhone}</p></div> },
          { key: 'submittedAt', header: 'Submitted', render: (s) => (s.submittedAt ? date(s.submittedAt) : '—') },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} label={s.status === 'PENDING' ? 'Awaiting review' : undefined} /> },
        ]}
      />
    </div>
  );
}

export function SellerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'seller', id], queryFn: () => api(`/admin/sellers/${id}`) });
  usePageTitle(data?.profile.businessName ?? 'Seller');
  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const { profile, stats, history } = data;
  const shop = profile.user.shop;

  const ACTIONS = {
    approve: { title: 'Approve this seller?', description: 'The shop goes live and the seller can publish products.', confirm: 'Approve', tone: 'primary', reason: true, required: false, label: 'Note to seller (optional)' },
    reject: { title: 'Request changes?', description: 'The seller will see your note and can resubmit.', confirm: 'Reject application', tone: 'danger', reason: true, required: true, label: 'What needs to change?' },
    suspend: { title: 'Suspend this seller?', description: 'Their shop and products are hidden immediately. Existing orders continue.', confirm: 'Suspend', tone: 'danger', reason: true, required: true, label: 'Reason (shared with the seller)' },
    reinstate: { title: 'Reinstate this seller?', description: 'Their shop becomes visible again.', confirm: 'Reinstate', tone: 'primary', reason: true, required: false, label: 'Note (optional)' },
  };
  const a = action && ACTIONS[action];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/admin/sellers', label: 'Sellers' }}
        title={profile.businessName}
        description={`Seller account of ${profile.user.name}`}
        actions={
          <>
            <StatusBadge status={profile.status} />
            {['PENDING', 'REJECTED', 'DRAFT'].includes(profile.status) && <Button size="sm" onClick={() => setAction('approve')}>Approve</Button>}
            {profile.status === 'PENDING' && <Button size="sm" variant="danger-outline" onClick={() => setAction('reject')}>Reject</Button>}
            {profile.status === 'APPROVED' && <Button size="sm" variant="danger-outline" onClick={() => setAction('suspend')}>Suspend</Button>}
            {profile.status === 'SUSPENDED' && <Button size="sm" onClick={() => setAction('reinstate')}>Reinstate</Button>}
          </>
        }
      />
      {profile.reviewNote && <Alert tone={profile.status === 'APPROVED' ? 'info' : 'warning'} title="Latest review note">{profile.reviewNote}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Business details" />
          <DescriptionList items={[
            ['Business type', titleCase(profile.businessType)],
            ['TIN / registration', profile.registrationNumber],
            ['Address', profile.businessAddress],
            ['Phone', profile.businessPhone],
            ['Email', profile.businessEmail ?? profile.user.email],
            ['Account email', profile.user.email],
            ['Payout', profile.payoutAccountNumber ? `${PAYMENT_METHODS[profile.payoutMethod]} · ${profile.payoutAccountName} · ${profile.payoutAccountNumber}` : 'Not provided'],
            ['Submitted', profile.submittedAt ? dateTime(profile.submittedAt) : 'Not submitted'],
          ]} />
        </Card>
        <Card>
          <CardHeader title="Shop" action={shop?.status === 'ACTIVE' && <Button size="xs" variant="ghost" icon={ExternalLink} to={`/shop/${shop.slug}`}>View</Button>} />
          {shop ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                {shop.logoUrl && <img src={shop.logoUrl} alt="" className="size-12 rounded-lg object-cover" />}
                <div><p className="font-semibold">{shop.name}</p><StatusBadge status={shop.status} /></div>
              </div>
              {shop.description && <p className="text-slate-600">{shop.description}</p>}
              <p className="text-slate-500">{[shop.city, shop.address].filter(Boolean).join(' · ')}</p>
              <p className="text-slate-500">Fulfilment: {shop.fulfillmentMode === 'SELF' ? 'Seller delivers' : 'Rivoshoppa couriers'} · Commission {shop.commissionRateBps !== null ? bpsToPercent(shop.commissionRateBps) : 'default'}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">The seller has not created a shop yet.</p>
          )}
        </Card>
      </div>
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Products', stats.products],
            ['Orders', stats.orders],
            ['Delivered sales', money(stats.deliveredRevenue)],
            ['Commission earned', money(stats.commission)],
            ['Available balance', money(stats.balance.available)],
          ].map(([label, value]) => (
            <Card key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader title="Review history" />
        {history.length ? (
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2">
                <span><Badge>{h.action.replace('admin.seller_', '').replace('seller.', '')}</Badge> {h.actor?.name ?? 'System'} {h.metadata?.note && `— “${h.metadata.note}”`}</span>
                <span className="text-xs text-slate-500">{dateTime(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No review actions yet.</p>
        )}
      </Card>
      {a && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          title={a.title}
          description={a.description}
          confirmLabel={a.confirm}
          tone={a.tone}
          reason={a.reason}
          reasonRequired={a.required}
          reasonLabel={a.label}
          onConfirm={async (note) => {
            await api(`/admin/sellers/${id}/${action}`, { method: 'POST', body: { note: note || undefined } });
            toast.success('Seller updated');
            queryClient.invalidateQueries({ queryKey: ['admin'] });
          }}
        />
      )}
    </div>
  );
}

function ShopConfigModal({ shop, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [commission, setCommission] = useState(shop.commissionRateBps !== null ? String(shop.commissionRateBps / 100) : '');
  const [mode, setMode] = useState(shop.fulfillmentMode);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/admin/shops/${shop.id}`, { method: 'PATCH', body: { commissionRateBps: commission === '' ? null : Math.round(Number(commission) * 100), fulfillmentMode: mode } });
      toast.success('Shop updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'shops'] });
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Configure ${shop.name}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Commission override (%)" type="number" step="0.1" min={0} max={50} value={commission} onChange={(e) => setCommission(e.target.value)} hint="Leave empty to use the category or marketplace default." />
        <Select label="Fulfilment" value={mode} onChange={(e) => setMode(e.target.value)} options={[{ value: 'SELF', label: 'Seller delivers (keeps delivery fee)' }, { value: 'MARKETPLACE', label: 'Rivoshoppa couriers' }]} />
      </div>
    </Modal>
  );
}

export function ShopsList() {
  usePageTitle('Shops');
  const [params, update] = useListParams({ status: '', q: '', page: '1' });
  const [config, setConfig] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'shops', params], queryFn: () => api('/admin/shops', { query: params }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Shops" description="Commission overrides and fulfilment settings per shop." />
      <div className="mb-4 flex gap-3">
        <Input aria-label="Search shops" placeholder="Search shops" defaultValue={params.q} onKeyDown={(e) => e.key === 'Enter' && update({ q: e.currentTarget.value })} className="flex-1" />
        <Select aria-label="Status" value={params.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status" options={['PENDING', 'ACTIVE', 'SUSPENDED'].map((s) => ({ value: s, label: titleCase(s) }))} className="w-44" />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        columns={[
          { key: 'name', header: 'Shop', render: (s) => <div><p className="font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.seller.email}</p></div> },
          { key: 'products', header: 'Products', render: (s) => s._count.products },
          { key: 'fulfillment', header: 'Fulfilment', render: (s) => (s.fulfillmentMode === 'SELF' ? 'Seller' : 'Rivoshoppa') },
          { key: 'commission', header: 'Commission', render: (s) => (s.commissionRateBps !== null ? bpsToPercent(s.commissionRateBps) : <span className="text-slate-400">Default</span>) },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
          { key: 'actions', header: '', render: (s) => <div className="flex gap-2"><Button size="xs" variant="outline" onClick={() => setConfig(s)}>Configure</Button>{s.seller.sellerProfile && <Link to={`/admin/sellers/${s.seller.sellerProfile.id}`} className="text-xs font-semibold text-brand-700 hover:underline">Seller</Link>}</div> },
        ]}
      />
      {config && <ShopConfigModal shop={config} onClose={() => setConfig(null)} />}
    </div>
  );
}
