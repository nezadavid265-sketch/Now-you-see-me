import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, dateTime, money, titleCase } from '../../lib/format.js';
import { useForm, useListParams, usePageTitle } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, DescriptionList, Input, PageHeader, PageLoader, PasswordInput, Select, StatusBadge } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

export const PERMISSIONS = [
  ['users', 'Users & couriers'],
  ['sellers', 'Sellers & shops'],
  ['catalog', 'Products, categories, reviews'],
  ['orders', 'Orders & deliveries'],
  ['finance', 'Payments, refunds, payouts'],
  ['marketing', 'Promo codes & banners'],
  ['content', 'Pages & announcements'],
  ['support', 'Support tickets'],
  ['reports', 'Reports'],
  ['audit', 'Audit log & security'],
  ['settings', 'Marketplace settings'],
];

const DEFAULTS = { role: '', status: '', q: '', page: '1' };

export function UsersList() {
  usePageTitle('Users');
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users', params], queryFn: () => api('/admin/users', { query: params }), placeholderData: (p) => p });
  return (
    <div>
      <PageHeader title="Users" description="Buyers, sellers, couriers and administrators." actions={<Button icon={UserPlus} to="/admin/staff">Add staff</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex flex-1 gap-2">
          <Input aria-label="Search users" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
        <Select aria-label="Role" value={params.role} onChange={(e) => update({ role: e.target.value })} placeholder="All roles" options={['BUYER', 'SELLER', 'DELIVERY', 'ADMIN'].map((r) => ({ value: r, label: titleCase(r) }))} className="sm:w-44" />
        <Select aria-label="Status" value={params.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} className="sm:w-44" />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
        columns={[
          { key: 'name', header: 'User', render: (u) => <div><p className="font-medium text-slate-900">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
          { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'ADMIN' ? 'violet' : u.role === 'SELLER' ? 'brand' : u.role === 'DELIVERY' ? 'cyan' : 'slate'}>{u.isSuperAdmin ? 'Super admin' : titleCase(u.role)}</Badge> },
          { key: 'phone', header: 'Phone', hideOnMobile: true, render: (u) => u.phone ?? '—' },
          { key: 'createdAt', header: 'Joined', render: (u) => date(u.createdAt) },
          { key: 'lastLoginAt', header: 'Last sign-in', hideOnMobile: true, render: (u) => (u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never') },
          { key: 'status', header: 'Status', render: (u) => <div className="flex gap-1"><StatusBadge status={u.status} />{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="amber"><Lock className="size-3" /> Locked</Badge>}</div> },
        ]}
      />
    </div>
  );
}

function PermissionsEditor({ user, onSaved }) {
  const toast = useToast();
  const [perms, setPerms] = useState(user.adminPermissions);
  const [superAdmin, setSuperAdmin] = useState(user.isSuperAdmin);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}/permissions`, { method: 'PATCH', body: { adminPermissions: perms, isSuperAdmin: superAdmin } });
      toast.success('Permissions updated');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Administrator permissions" description="Only super administrators can change these." />
      <Checkbox className="mb-4" label="Super administrator" description="Full access, including managing other administrators." checked={superAdmin} onChange={(e) => setSuperAdmin(e.target.checked)} />
      <div className="grid gap-3 sm:grid-cols-2">
        {PERMISSIONS.map(([key, label]) => (
          <Checkbox key={key} label={label} checked={superAdmin || perms.includes(key)} disabled={superAdmin} onChange={(e) => setPerms(e.target.checked ? [...perms, key] : perms.filter((p) => p !== key))} />
        ))}
      </div>
      <Button className="mt-5" onClick={save} loading={busy}>Save permissions</Button>
    </Card>
  );
}

export function UserDetail() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api(`/admin/users/${id}`) });
  usePageTitle(data?.user.name ?? 'User');
  if (isLoading) return <PageLoader />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const { user, stats, recentOrders } = data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] });
  const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/admin/users', label: 'Users' }}
        title={user.name}
        description={`${titleCase(user.role)} · joined ${date(user.createdAt)}`}
        actions={
          <>
            <StatusBadge status={user.status} />
            {locked && <Button size="sm" variant="outline" icon={Lock} onClick={async () => { await api(`/admin/users/${id}/unlock`, { method: 'POST' }); toast.success('Account unlocked'); refresh(); }}>Unlock</Button>}
            {user.id !== me.id && !user.isSuperAdmin && (
              user.status === 'ACTIVE'
                ? <Button size="sm" variant="danger-outline" onClick={() => setDialog('suspend')}>Suspend</Button>
                : <Button size="sm" onClick={() => setDialog('activate')}>Reactivate</Button>
            )}
          </>
        }
      />
      {user.status === 'SUSPENDED' && user.suspendedReason && <Alert tone="error" title="Suspended">{user.suspendedReason}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profile" />
          <DescriptionList
            items={[
              ['Email', <span key="e">{user.email} {user.emailVerifiedAt ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}</span>],
              ['Phone', user.phone],
              ['Last sign-in', user.lastLoginAt ? dateTime(user.lastLoginAt) : 'Never'],
              ['Failed sign-ins', user.failedLoginCount],
              ['Notifications', [user.notifyEmail && 'Email', user.notifySms && 'SMS'].filter(Boolean).join(', ') || 'In-app only'],
              user.shop && ['Shop', <Link key="s" to={`/admin/sellers/${user.sellerProfile?.id}`} className="font-semibold text-brand-700 hover:underline">{user.shop.name}</Link>],
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Activity" />
          <DescriptionList className="sm:grid-cols-1" items={[['Orders', stats.orders], ['Total spent', money(stats.totalSpent)], ['Support tickets', stats.tickets], ['Saved addresses', user.addresses.length]]} />
        </Card>
      </div>
      {user.role === 'ADMIN' && me.isSuperAdmin && user.id !== me.id && <PermissionsEditor user={user} onSaved={refresh} />}
      {user.role === 'ADMIN' && !me.isSuperAdmin && (
        <Card><CardHeader title="Permissions" /><div className="flex flex-wrap gap-1.5">{(user.isSuperAdmin ? ['super admin'] : user.adminPermissions).map((p) => <Badge key={p} tone="violet"><ShieldCheck className="size-3" /> {p}</Badge>)}</div></Card>
      )}
      {recentOrders.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Recent orders</h2>
          <DataTable rows={recentOrders} columns={[
            { key: 'orderNumber', header: 'Order', render: (o) => <Link to={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link> },
            { key: 'createdAt', header: 'Date', render: (o) => date(o.createdAt) },
            { key: 'total', header: 'Total', render: (o) => money(o.total) },
            { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
          ]} />
        </div>
      )}
      <ConfirmDialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog === 'suspend' ? `Suspend ${user.name}?` : `Reactivate ${user.name}?`}
        description={dialog === 'suspend' ? 'They will be signed out everywhere and cannot sign in until reactivated. They will receive an email.' : 'They will be able to sign in again.'}
        confirmLabel={dialog === 'suspend' ? 'Suspend account' : 'Reactivate'}
        tone={dialog === 'suspend' ? 'danger' : 'primary'}
        reason={dialog === 'suspend'}
        reasonRequired
        reasonLabel="Reason (shared with the user)"
        onConfirm={async (reason) => {
          await api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status: dialog === 'suspend' ? 'SUSPENDED' : 'ACTIVE', reason: reason || undefined } });
          toast.success('Account updated');
          refresh();
        }}
      />
    </div>
  );
}

export function StaffPage() {
  usePageTitle('Staff & couriers');
  const { user: me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const couriers = useQuery({ queryKey: ['admin', 'staff', 'couriers'], queryFn: () => api('/admin/users', { query: { role: 'DELIVERY', pageSize: 100 } }) });
  const admins = useQuery({ queryKey: ['admin', 'staff', 'admins'], queryFn: () => api('/admin/users', { query: { role: 'ADMIN', pageSize: 100 } }) });
  const form = useForm({ name: '', email: '', phone: '', password: '', role: 'DELIVERY', adminPermissions: [] });
  const onSubmit = form.submit(async (v) => {
    await api('/admin/users', { method: 'POST', body: { ...v, phone: v.phone || undefined } });
    toast.success(`${v.role === 'ADMIN' ? 'Administrator' : 'Courier'} account created`);
    queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
    form.setValues({ name: '', email: '', phone: '', password: '', role: 'DELIVERY', adminPermissions: [] });
    setOpen(false);
  });
  const columns = [
    { key: 'name', header: 'Name', render: (u) => <Link to={`/admin/users/${u.id}`} className="font-medium text-brand-700 hover:underline">{u.name}</Link> },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', render: (u) => u.phone ?? '—' },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Staff & couriers" description="Create accounts for delivery staff and administrators." actions={<Button icon={Plus} onClick={() => setOpen(true)}>New staff account</Button>} />
      <div>
        <h2 className="mb-3 text-base font-semibold">Delivery staff</h2>
        <DataTable loading={couriers.isLoading} rows={couriers.data?.items} columns={columns} empty="No couriers yet." />
      </div>
      <div>
        <h2 className="mb-3 text-base font-semibold">Administrators</h2>
        <DataTable loading={admins.isLoading} rows={admins.data?.items} columns={[...columns, { key: 'perms', header: 'Access', render: (u) => (u.isSuperAdmin ? <Badge tone="violet">Super admin</Badge> : <span className="text-xs text-slate-500">{u.adminPermissions.join(', ') || 'None'}</span>) }]} />
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="New staff account" size="lg" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Create account</Button></>}>
        <form onSubmit={onSubmit} className="space-y-4">
          {form.formError && <Alert tone="error">{form.formError}</Alert>}
          <Select label="Account type" {...form.field('role')} options={[{ value: 'DELIVERY', label: 'Delivery staff (courier)' }, ...(me.isSuperAdmin ? [{ value: 'ADMIN', label: 'Administrator' }] : [])]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" required {...form.field('name')} />
            <Input label="Phone" type="tel" {...form.field('phone')} />
            <Input label="Email" type="email" required {...form.field('email')} />
            <PasswordInput label="Temporary password" required hint="Share it securely; they can change it after signing in." {...form.field('password')} />
          </div>
          {form.values.role === 'ADMIN' && (
            <div className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              {PERMISSIONS.map(([key, label]) => (
                <Checkbox key={key} label={label} checked={form.values.adminPermissions.includes(key)} onChange={(e) => form.set('adminPermissions', e.target.checked ? [...form.values.adminPermissions, key] : form.values.adminPermissions.filter((p) => p !== key))} />
              ))}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
