import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money, percentOff } from '../../lib/format.js';
import { useForm, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ImageUploader } from '../../components/ImageUploader.jsx';
import { Alert, Button, Card, CardHeader, Input, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '../../components/ui/index.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';

const EMPTY = {
  name: '',
  description: '',
  categoryId: '',
  brand: '',
  sku: '',
  price: '',
  compareAtPrice: '',
  stock: '1',
  lowStockThreshold: '5',
  images: [],
  specifications: [],
  tags: [],
};

function TagsInput({ value, onChange }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim().toLowerCase();
    if (t && !value.includes(t) && value.length < 15) onChange([...value, t]);
    setText('');
  };
  return (
    <div>
      <div className="flex gap-2">
        <Input aria-label="Add a search keyword" placeholder="e.g. smartphone, gift, made in rwanda" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className="flex-1" />
        <Button variant="outline" onClick={add} icon={Plus}>Add</Button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  usePageTitle(isNew ? 'Add product' : 'Edit product');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useForm(EMPTY);
  const [saving, setSaving] = useState(null);

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories'), staleTime: 5 * 60_000 });
  const existing = useQuery({ queryKey: ['seller', 'product', id], queryFn: () => api(`/seller/products/${id}`), enabled: !isNew });
  const product = existing.data?.product;

  useEffect(() => {
    if (!product) return;
    form.setValues({
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      brand: product.brand ?? '',
      sku: product.sku ?? '',
      price: String(product.price),
      compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '',
      stock: String(product.stock),
      lowStockThreshold: String(product.lowStockThreshold),
      images: product.images.map((i) => ({ url: i.url, alt: i.alt ?? '' })),
      specifications: Array.isArray(product.specifications) ? product.specifications : [],
      tags: product.tags,
    });
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isNew && existing.isLoading) return <PageLoader />;
  if (!isNew && existing.error) return <Alert tone="error">{existing.error.message}</Alert>;

  const v = form.values;
  const discount = percentOff(Number(v.price), Number(v.compareAtPrice));
  const specs = v.specifications;

  const save = (status) =>
    form.submit(async () => {
      setSaving(status);
      try {
        const body = {
          name: v.name,
          description: v.description,
          categoryId: v.categoryId,
          brand: v.brand || null,
          sku: v.sku || null,
          price: Number(v.price),
          compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
          stock: Number(v.stock || 0),
          lowStockThreshold: Number(v.lowStockThreshold || 0),
          images: v.images.map((i) => ({ url: i.url, alt: i.alt || null })),
          specifications: specs.filter((s) => s.name.trim() && s.value.trim()),
          tags: v.tags,
          status,
        };
        const res = isNew ? await api('/seller/products', { method: 'POST', body }) : await api(`/seller/products/${id}`, { method: 'PATCH', body });
        queryClient.invalidateQueries({ queryKey: ['seller'] });
        toast.success(status === 'PUBLISHED' ? 'Product is live!' : status === 'ARCHIVED' ? 'Product archived' : 'Draft saved');
        if (isNew) navigate(`/seller/products/${res.product.id}`, { replace: true });
      } finally {
        setSaving(null);
      }
    })();

  const remove = async () => {
    await api(`/seller/products/${id}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['seller'] });
    toast.success('Product removed');
    navigate('/seller/products');
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ to: '/seller/products', label: 'Products' }}
        title={isNew ? 'Add a product' : product?.name}
        actions={
          product && (
            <>
              <StatusBadge status={product.status} />
              {product.moderationStatus !== 'APPROVED' && <StatusBadge status={product.moderationStatus} label={product.moderationStatus === 'PENDING' ? 'In review' : undefined} />}
              {product.status === 'PUBLISHED' && product.moderationStatus === 'APPROVED' && <Button size="sm" variant="outline" icon={Eye} to={`/p/${product.slug}`}>View in store</Button>}
            </>
          )
        }
      />
      {product?.moderationNote && product.moderationStatus !== 'APPROVED' && (
        <Alert className="mb-6" tone={product.moderationStatus === 'PENDING' ? 'info' : 'warning'} title="Note from Rivoshoppa">{product.moderationNote}</Alert>
      )}
      {form.formError && <Alert className="mb-6" tone="error">{form.formError}</Alert>}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Photos" description="Clear photos on a plain background sell best. Add up to 8." />
          <ImageUploader value={v.images} onChange={(imgs) => form.set('images', imgs)} error={form.errors.images} />
        </Card>

        <Card>
          <CardHeader title="Basic information" />
          <div className="space-y-4">
            <Input label="Product name" required maxLength={150} placeholder="e.g. Samsung Galaxy A15 (128GB, Black)" hint="Include brand, model and key details like size or colour." {...form.field('name')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Category" required placeholder="Choose a category" {...form.field('categoryId')}>
                {categories.data?.items.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name} (general)</option>
                    {c.children.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                  </optgroup>
                ))}
              </Select>
              <Input label="Brand (optional)" maxLength={60} {...form.field('brand')} />
            </div>
            <Textarea label="Description" required rows={6} maxLength={5000} placeholder="Describe the product: what it is, what's included, condition, warranty…" hint={`${v.description.length}/5000 characters`} {...form.field('description')} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Price" description="Amounts in Rwandan francs (RWF)." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Selling price" required type="number" min={1} inputMode="numeric" suffix="RWF" {...form.field('price')} />
            <Input label="Original price (optional)" type="number" min={0} inputMode="numeric" suffix="RWF" hint="Shows a discount when higher than the selling price." {...form.field('compareAtPrice')} />
          </div>
          {discount > 0 && <p className="mt-3 text-sm font-semibold text-emerald-700">Buyers will see −{discount}% (save {money(Number(v.compareAtPrice) - Number(v.price))}).</p>}
        </Card>

        <Card>
          <CardHeader title="Inventory" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Units in stock" required type="number" min={0} inputMode="numeric" {...form.field('stock')} />
            <Input label="Low-stock alert at" type="number" min={0} inputMode="numeric" hint="We’ll notify you at this level." {...form.field('lowStockThreshold')} />
            <Input label="SKU (optional)" maxLength={60} hint="Your own product code." {...form.field('sku')} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Details" description="Specifications appear as a table on the product page. Keywords help buyers find you." />
          <div className="space-y-2">
            {specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Specification name" placeholder="e.g. Storage" value={s.name} onChange={(e) => form.set('specifications', specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-2/5" />
                <Input aria-label="Specification value" placeholder="e.g. 128GB" value={s.value} onChange={(e) => form.set('specifications', specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="flex-1" />
                <Button variant="ghost" icon={Trash2} aria-label="Remove specification" onClick={() => form.set('specifications', specs.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button variant="outline" size="sm" icon={Plus} onClick={() => form.set('specifications', [...specs, { name: '', value: '' }])} disabled={specs.length >= 30}>
              Add specification
            </Button>
          </div>
          <div className="mt-6">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Search keywords</p>
            <TagsInput value={v.tags} onChange={(tags) => form.set('tags', tags)} />
          </div>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <div>
            {!isNew && product.status !== 'ARCHIVED' && (
              <Button variant="danger-outline" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={saving === 'DRAFT'} disabled={Boolean(saving)} onClick={() => save('DRAFT')}>
              {product?.status === 'PUBLISHED' ? 'Unpublish (save as draft)' : 'Save as draft'}
            </Button>
            <Button loading={saving === 'PUBLISHED'} disabled={Boolean(saving)} onClick={() => save('PUBLISHED')}>
              {product?.status === 'PUBLISHED' ? 'Save changes' : 'Publish product'}
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this product?"
        description="Products that have been ordered before are archived instead, so your order history stays intact."
        confirmLabel="Delete product"
        tone="danger"
      />
    </div>
  );
}
