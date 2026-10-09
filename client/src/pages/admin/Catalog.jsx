import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { bpsToPercent, date, money } from '../../lib/format.js';
import { useForm, useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { CategoryIcon, CATEGORY_ICON_NAMES } from '../../components/CategoryIcon.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Checkbox, Input, PageHeader, Select, Stars, StatusBadge, Tabs, Textarea } from '../../components/ui/index.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';

// ── Products ───────────────────────────────────────────────────────

export function ProductsModeration() {
  usePageTitle('Products');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, update] = useListParams({ moderation: '', q: '', featured: '', page: '1' });
  const [search, setSearch] = useState(params.q);
  const [action, setAction] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'products', params], queryFn: () => api('/admin/products', { query: params }), placeholderData: (p) => p });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  const feature = async (p) => {
    try {
      await api(`/admin/products/${p.id}/featured`, { method: 'PATCH', body: { isFeatured: !p.isFeatured } });
      toast.success(p.isFeatured ? 'Removed from featured' : 'Featured on the home page');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div>
      <PageHeader title="Products" description="Moderate listings and choose featured products for the home page." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={params.featured === 'true' ? 'FEATURED' : params.moderation || 'ALL'} onChange={(v) => update(v === 'FEATURED' ? { featured: 'true', moderation: '' } : { moderation: v === 'ALL' ? '' : v, featured: '' })} tabs={[
          { value: 'ALL', label: 'All' },
          { value: 'PENDING', label: 'Awaiting review' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'REMOVED', label: 'Removed' },
          { value: 'FEATURED', label: 'Featured' },
        ]} />
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex gap-2 lg:w-80">
          <Input aria-label="Search products" placeholder="Name, SKU or brand" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        columns={[
          { key: 'name', header: 'Product', render: (p) => <div className="flex items-center gap-3"><ProductImage src={p.image} alt="" className="size-11 shrink-0 rounded-lg" /><div className="min-w-0"><p className="max-w-[240px] truncate font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.shop.name} · {p.category.name}</p></div></div> },
          { key: 'price', header: 'Price', render: (p) => money(p.price) },
          { key: 'stock', header: 'Stock', hideOnMobile: true },
          { key: 'status', header: 'Status', render: (p) => <div className="flex flex-wrap gap-1"><StatusBadge status={p.status} /><StatusBadge status={p.moderationStatus} label={p.moderationStatus === 'PENDING' ? 'In review' : undefined} />{p.isFeatured && <Badge tone="accent"><Star className="size-3" /> Featured</Badge>}</div> },
          {
            key: 'actions',
            header: 'Actions',
            render: (p) => (
              <div className="flex flex-wrap gap-1.5">
                {p.moderationStatus !== 'APPROVED' && <Button size="xs" onClick={() => setAction({ product: p, status: 'APPROVED' })}>Approve</Button>}
                {p.moderationStatus === 'APPROVED' && <Button size="xs" variant="outline" onClick={() => feature(p)}>{p.isFeatured ? 'Unfeature' : 'Feature'}</Button>}
                {p.moderationStatus !== 'REJECTED' && p.moderationStatus !== 'REMOVED' && <Button size="xs" variant="outline" onClick={() => setAction({ product: p, status: 'REJECTED' })}>Reject</Button>}
                {p.moderationStatus !== 'REMOVED' && <Button size="xs" variant="danger-outline" onClick={() => setAction({ product: p, status: 'REMOVED' })}>Remove</Button>}
                {p.status === 'PUBLISHED' && p.moderationStatus === 'APPROVED' && <Link to={`/p/${p.slug}`} className="text-xs font-semibold text-brand-700 hover:underline">View</Link>}
              </div>
            ),
          },
        ]}
      />
      {action && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          title={{ APPROVED: 'Approve product?', REJECTED: 'Request changes?', REMOVED: 'Remove product?' }[action.status]}
          description={action.product.name}
          confirmLabel={{ APPROVED: 'Approve', REJECTED: 'Reject', REMOVED: 'Remove product' }[action.status]}
          tone={action.status === 'APPROVED' ? 'primary' : 'danger'}
          reason
          reasonRequired={action.status !== 'APPROVED'}
          reasonLabel={action.status === 'APPROVED' ? 'Note (optional)' : 'Reason (shared with the seller)'}
          onConfirm={async (note) => {
            await api(`/admin/products/${action.product.id}/moderation`, { method: 'PATCH', body: { moderationStatus: action.status, note: note || undefined } });
            toast.success('Product updated');
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Categories ─────────────────────────────────────────────────────

function CategoryModal({ category, parents, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    icon: category?.icon ?? '',
    parentId: category?.parentId ?? '',
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
    commission: category?.commissionRateBps !== null && category?.commissionRateBps !== undefined ? String(category.commissionRateBps / 100) : '',
  });
  const onSubmit = form.submit(async (v) => {
    const body = {
      name: v.name,
      slug: v.slug || undefined,
      description: v.description || null,
      icon: v.icon || null,
      parentId: v.parentId || null,
      sortOrder: Number(v.sortOrder || 0),
      isActive: v.isActive,
      commissionRateBps: v.commission === '' ? null : Math.round(Number(v.commission) * 100),
    };
    if (category) await api(`/admin/categories/${category.id}`, { method: 'PATCH', body });
    else await api('/admin/categories', { method: 'POST', body });
    queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    toast.success('Category saved');
    onClose();
  });
  return (
    <Modal open onClose={onClose} title={category ? 'Edit category' : 'New category'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSubmit} loading={form.submitting}>Save</Button></>}>
      <form onSubmit={onSubmit} className="space-y-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" required {...form.field('name')} />
          <Input label="URL slug" hint="Leave empty to generate" {...form.field('slug')} />
          <Select label="Parent" placeholder="— Top level —" {...form.field('parentId')} options={parents.filter((p) => p.id !== category?.id).map((p) => ({ value: p.id, label: p.name }))} />
          <Select label="Icon" placeholder="Default" {...form.field('icon')} options={CATEGORY_ICON_NAMES.map((n) => ({ value: n, label: n }))} />
          <Input label="Commission override (%)" type="number" step="0.1" min={0} max={50} hint="Empty = parent / marketplace default" {...form.field('commission')} />
          <Input label="Sort order" type="number" min={0} {...form.field('sortOrder')} />
        </div>
        <Textarea label="Description" rows={2} maxLength={300} {...form.field('description')} />
        <Checkbox label="Active (visible to shoppers)" checked={form.values.isActive} onChange={(e) => form.set('isActive', e.target.checked)} />
      </form>
    </Modal>
  );
}

export function CategoriesPage() {
  usePageTitle('Categories');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api('/admin/categories') });
  const items = data?.items ?? [];
  const parents = items.filter((c) => !c.parentId);
  const ordered = parents.flatMap((p) => [p, ...items.filter((c) => c.parentId === p.id)]);
  return (
    <div>
      <PageHeader title="Categories" description="Two-level category tree with optional commission rules." actions={<Button icon={Plus} onClick={() => setEditing('new')}>New category</Button>} />
      <DataTable
        loading={isLoading}
        rows={ordered}
        columns={[
          { key: 'name', header: 'Category', render: (c) => <span className={`flex items-center gap-2 ${c.parentId ? 'pl-6 text-slate-600' : 'font-semibold'}`}><CategoryIcon name={c.icon} className="size-4 text-brand-600" />{c.name}</span> },
          { key: 'slug', header: 'Slug', hideOnMobile: true, render: (c) => <code className="text-xs">{c.slug}</code> },
          { key: 'products', header: 'Products', render: (c) => c._count.products },
          { key: 'commission', header: 'Commission', render: (c) => (c.commissionRateBps !== null ? bpsToPercent(c.commissionRateBps) : <span className="text-slate-400">Inherited</span>) },
          { key: 'active', header: 'Visible', render: (c) => (c.isActive ? <Badge tone="green">Yes</Badge> : <Badge>Hidden</Badge>) },
          { key: 'actions', header: '', render: (c) => <div className="flex gap-1"><Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(c)}>Edit</Button><Button size="xs" variant="ghost" icon={Trash2} className="text-red-600" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} /></div> },
        ]}
      />
      {editing && <CategoryModal category={editing === 'new' ? null : editing} parents={parents} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Only empty categories can be deleted. Deactivate a category to hide it instead."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await api(`/admin/categories/${deleting.id}`, { method: 'DELETE' });
          queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
          toast.success('Category deleted');
        }}
      />
    </div>
  );
}

// ── Reviews ────────────────────────────────────────────────────────

export function ReviewsModeration() {
  usePageTitle('Reviews');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, update] = useListParams({ rating: '', hidden: '', page: '1' });
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'reviews', params], queryFn: () => api('/admin/reviews', { query: params }), placeholderData: (p) => p });
  const toggle = async (r) => {
    await api(`/admin/reviews/${r.id}`, { method: 'PATCH', body: { isHidden: !r.isHidden } });
    toast.success(r.isHidden ? 'Review restored' : 'Review hidden');
    queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
  };
  return (
    <div>
      <PageHeader title="Reviews" description="Hide reviews that break the content policy. Ratings are recalculated automatically." />
      <div className="mb-4 flex gap-3">
        <Select aria-label="Rating" value={params.rating} onChange={(e) => update({ rating: e.target.value })} placeholder="All ratings" options={[1, 2, 3, 4, 5].map((r) => ({ value: r, label: `${r} stars` }))} className="w-40" />
        <Select aria-label="Visibility" value={params.hidden} onChange={(e) => update({ hidden: e.target.value })} placeholder="All" options={[{ value: 'false', label: 'Visible' }, { value: 'true', label: 'Hidden' }]} className="w-40" />
      </div>
      <DataTable
        loading={isLoading}
        rows={data?.items}
        pagination={data?.pagination}
        onPageChange={(p) => update({ page: String(p) })}
        columns={[
          { key: 'rating', header: 'Rating', render: (r) => <Stars value={r.rating} /> },
          { key: 'review', header: 'Review', render: (r) => <div className="max-w-md"><p className="font-medium">{r.title}</p><p className="line-clamp-2 text-slate-600">{r.body}</p></div> },
          { key: 'product', header: 'Product', hideOnMobile: true, render: (r) => <div><Link to={`/p/${r.product.slug}`} className="text-brand-700 hover:underline">{r.product.name}</Link><p className="text-xs text-slate-500">{r.product.shop.name}</p></div> },
          { key: 'author', header: 'By', hideOnMobile: true, render: (r) => <div className="text-xs"><p>{r.user.name}</p><p className="text-slate-500">{date(r.createdAt)}</p></div> },
          { key: 'actions', header: '', render: (r) => <Button size="xs" variant={r.isHidden ? 'outline' : 'danger-outline'} icon={r.isHidden ? Eye : EyeOff} onClick={() => toggle(r)}>{r.isHidden ? 'Restore' : 'Hide'}</Button> },
        ]}
      />
    </div>
  );
}

