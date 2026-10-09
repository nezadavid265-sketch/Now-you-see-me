import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, KeyRound, Lock, ShieldAlert, UserX } from 'lucide-react';
import { api, download } from '../../lib/api.js';
import { dateTime } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, CardHeader, Input, PageHeader, PageLoader, Select, Stat, Textarea, Toggle } from '../../components/ui/index.jsx';

// ── Reports ────────────────────────────────────────────────────────

const REPORTS = [
  ['orders', 'Orders', 'Every order with buyer, payment and totals.'],
  ['sales-by-shop', 'Sales by shop', 'Orders, sales, delivery fees, commission and seller net per shop.'],
  ['commissions', 'Commissions', 'Commission earned on each delivered shipment.'],
  ['payouts', 'Payouts', 'Payouts sent to sellers with references.'],
  ['refunds', 'Refunds', 'Refund requests and automatic refunds.'],
  ['products', 'Product catalogue', 'All listings with stock, status and sales.'],
];

export function ReportsPage() {
  usePageTitle('Reports');
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(null);
  const get = async (type) => {
    setBusy(type);
    try {
      await download(`/admin/reports/${type}`, { from: from || undefined, to: to ? `${to}T23:59:59` : undefined });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <PageHeader title="Reports" description="Download CSV files that open in Excel or Google Sheets. Exports are recorded in the audit log." />
      <Card className="mb-6 flex flex-wrap items-end gap-4">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <p className="pb-2 text-xs text-slate-500">Leave empty for all time.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(([type, title, text]) => (
          <Card key={type} className="flex flex-col">
            <FileSpreadsheet className="size-8 text-brand-600" />
            <p className="mt-3 font-semibold">{title}</p>
            <p className="mt-1 flex-1 text-sm text-slate-500">{text}</p>
            <Button className="mt-4" variant="outline" icon={Download} loading={busy === type} onClick={() => get(type)}>Download CSV</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Audit log ──────────────────────────────────────────────────────

export function AuditLogPage() {
  usePageTitle('Audit log');
  const [params, update] = useListParams({ action: '', entityType: '', from: '', to: '', page: '1' });
  const [open, setOpen] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'audit', params], queryFn: () => api('/admin/audit-logs', { query: params }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Audit log" description="A permanent record of sign-ins, administrative actions and sensitive changes." />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select aria-label="Action" value={params.action} onChange={(e) => update({ action: e.target.value })} placeholder="All actions" options={[
          { value: 'admin.', label: 'Admin actions' },
          { value: 'auth.', label: 'Authentication' },
          { value: 'auth.login_failed', label: 'Failed sign-ins' },
          { value: 'seller.', label: 'Seller actions' },
          { value: 'delivery.', label: 'Deliveries' },
          { value: 'account.', label: 'Account changes' },
        ]} />
        <Select aria-label="Entity" value={params.entityType} onChange={(e) => update({ entityType: e.target.value })} placeholder="All records" options={['User', 'SellerProfile', 'Shop', 'Product', 'SellerOrder', 'Payment', 'Refund', 'Payout', 'Coupon', 'Setting'].map((v) => ({ value: v, label: v }))} />
        <Input aria-label="From" type="date" value={params.from} onChange={(e) => update({ from: e.target.value })} />
        <Input aria-label="To" type="date" value={params.to} onChange={(e) => update({ to: e.target.value })} />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        onRowClick={(l) => setOpen(open === l.id ? null : l.id)}
        columns={[
          { key: 'createdAt', header: 'When', render: (l) => <span className="text-xs whitespace-nowrap">{dateTime(l.createdAt)}</span> },
          { key: 'action', header: 'Action', render: (l) => <Badge tone={l.action.includes('failed') || l.action.includes('reuse') || l.action.includes('locked') ? 'red' : l.action.startsWith('admin.') ? 'violet' : 'slate'}>{l.action}</Badge> },
          { key: 'actor', header: 'By', render: (l) => <span className="text-xs">{l.actor ? `${l.actor.name}` : 'System / anonymous'}{l.actorRole && <span className="text-slate-500"> · {l.actorRole.toLowerCase()}</span>}</span> },
          { key: 'entity', header: 'Record', hideOnMobile: true, render: (l) => (l.entityType ? <span className="text-xs">{l.entityType} <code className="text-slate-500">{l.entityId?.slice(-8)}</code></span> : '—') },
          { key: 'ip', header: 'IP', hideOnMobile: true, render: (l) => <code className="text-xs">{l.ip ?? '—'}</code> },
          { key: 'details', header: 'Details', render: (l) => (l.metadata ? open === l.id ? <pre className="max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(l.metadata, null, 2)}</pre> : <span className="text-xs text-brand-700">Show</span> : '—') },
        ]}
      />
    </div>
  );
}

// ── Security ───────────────────────────────────────────────────────

export function SecurityPage() {
  usePageTitle('Security');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'security'], queryFn: () => api('/admin/security'), refetchInterval: 60_000 });
  if (isLoading) return <PageLoader />;
  const unlock = async (id) => {
    await api(`/admin/users/${id}/unlock`, { method: 'POST' });
    toast.success('Account unlocked');
    queryClient.invalidateQueries({ queryKey: ['admin', 'security'] });
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Security monitoring" description="Brute-force attempts, locked accounts and session anomalies." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Failed sign-ins (24 h)" value={data.last24h.failedLogins} icon={KeyRound} tone={data.last24h.failedLogins > 20 ? 'accent' : 'slate'} />
        <Stat label="Account lockouts (24 h)" value={data.last24h.lockouts} icon={Lock} tone="amber" />
        <Stat label="Locked right now" value={data.lockedAccounts.length} icon={ShieldAlert} tone="violet" />
        <Stat label="Suspended accounts" value={data.suspendedAccounts} icon={UserX} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Locked accounts" />
          {data.lockedAccounts.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.lockedAccounts.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <span><Link to={`/admin/users/${u.id}`} className="font-medium text-brand-700 hover:underline">{u.email}</Link><span className="block text-xs text-slate-500">until {dateTime(u.lockedUntil)}</span></span>
                  <Button size="xs" variant="outline" onClick={() => unlock(u.id)}>Unlock</Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No locked accounts.</p>}
        </Card>
        <Card>
          <CardHeader title="Most failed sign-ins by IP (24 h)" />
          {data.suspiciousIps.length ? (
            <ul className="space-y-2 text-sm">
              {data.suspiciousIps.map((r) => <li key={r.ip ?? 'unknown'} className="flex justify-between"><code>{r.ip ?? 'unknown'}</code><Badge tone={r.failures > 10 ? 'red' : 'slate'}>{r.failures}</Badge></li>)}
            </ul>
          ) : <p className="text-sm text-slate-500">No failed sign-ins.</p>}
        </Card>
      </div>
      {data.tokenReuse.length > 0 && (
        <Alert tone="error" title="Refresh-token reuse detected">
          A revoked session token was presented, which can indicate a stolen cookie. The affected sessions were signed out: {data.tokenReuse.map((t) => t.actor?.email ?? 'unknown').join(', ')}.
        </Alert>
      )}
      <Card>
        <CardHeader title="Recent administrator actions" action={<Button size="xs" variant="ghost" to="/admin/audit?action=admin.">Full audit log</Button>} />
        <ul className="divide-y divide-slate-100 text-sm">
          {data.recentAdminActions.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span><Badge tone="violet">{a.action}</Badge> {a.actor?.name}</span><span className="text-xs text-slate-500">{dateTime(a.createdAt)}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────

export function SettingsPage() {
  usePageTitle('Marketplace settings');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api('/admin/settings') });
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setValues(data.settings);
  }, [data]);
  if (isLoading || !values) return <PageLoader />;

  const num = (key) => ({ type: 'number', value: values[key], error: errors[key], onChange: (e) => setValues({ ...values, [key]: e.target.value === '' ? '' : Number(e.target.value) }) });
  const txt = (key) => ({ value: values[key] ?? '', error: errors[key], onChange: (e) => setValues({ ...values, [key]: e.target.value }) });
  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== data.settings[k]));
      if (!Object.keys(changed).length) return toast.info('No changes to save');
      await api('/admin/settings', { method: 'PATCH', body: changed });
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
      toast.success('Settings saved');
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Marketplace settings" description="Changes apply immediately and are recorded in the audit log." actions={<Button onClick={save} loading={saving}>Save changes</Button>} />
      <Card>
        <CardHeader title="General" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Marketplace name" {...txt('marketplaceName')} />
          <Input label="Currency" maxLength={3} {...txt('currency')} />
          <Input label="Support email" type="email" {...txt('supportEmail')} />
          <Input label="Support phone" {...txt('supportPhone')} />
        </div>
        <Textarea className="mt-4" label="Announcement bar (top of the store)" rows={2} maxLength={200} {...txt('announcementBar')} />
      </Card>
      <Card>
        <CardHeader title="Commission & delivery" description="Commission rules: shop override → category → parent category → this default." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Default commission (basis points)" hint={`${(values.defaultCommissionBps / 100).toFixed(1)}% — 1000 = 10%`} {...num('defaultCommissionBps')} />
          <Input label="Delivery fee per shop (RWF)" {...num('deliveryFeeBase')} />
          <Input label="Free delivery from (RWF)" hint="Per shop subtotal" {...num('freeDeliveryThreshold')} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Payments & orders" />
        <div className="space-y-4">
          <Toggle label="Cash on delivery" description="Allow buyers to pay the courier in cash." checked={values.codEnabled} onChange={(v) => setValues({ ...values, codEnabled: v })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Cash on delivery limit (RWF)" {...num('codMaxOrderTotal')} />
            <Input label="Payment window (minutes)" hint="Unpaid orders are cancelled after this" {...num('paymentTimeoutMinutes')} />
            <Input label="Delivery code attempts" {...num('maxDeliveryCodeAttempts')} />
          </div>
          <Toggle label="Review new products before they go live" description="New listings wait for catalog approval." checked={values.requireProductApproval} onChange={(v) => setValues({ ...values, requireProductApproval: v })} />
          <Toggle label="Sellers may deliver themselves" description="Otherwise all orders use Rivoshoppa couriers." checked={values.sellerCanSelfDeliver} onChange={(v) => setValues({ ...values, sellerCanSelfDeliver: v })} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Refunds & payouts" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Refund window (days)" {...num('refundWindowDays')} />
          <Input label="Earnings hold (days)" hint="Before earnings become available" {...num('payoutHoldDays')} />
          <Input label="Minimum payout (RWF)" {...num('minPayoutAmount')} />
        </div>
      </Card>
      <div className="flex justify-end"><Button onClick={save} loading={saving}>Save changes</Button></div>
    </div>
  );
}
