import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';
import { useListParams, usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Badge, Button, EmptyState, Input, PageHeader, StatusBadge, Tabs } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Modal.jsx';

const DEFAULTS = { tab: 'all', q: '', page: '1' };
const TAB_QUERY = { all: {}, live: { status: 'PUBLISHED' }, draft: { status: 'DRAFT' }, low: { stock: 'low' }, out: { stock: 'out' }, archived: { status: 'ARCHIVED' } };

function StockModal({ product, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/seller/products/${product.id}/stock`, { method: 'PUT', body: { quantity: Number(quantity), note: 'Quick update from product list' } });
      queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
      toast.success('Stock updated');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Update stock" description={product.name} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <Input label="Units in stock" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} hint="Set the number of units you physically have available to sell." autoFocus />
    </Modal>
  );
}

export default function Products() {
  usePageTitle('Products');
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [stockFor, setStockFor] = useState(null);
  const [search, setSearch] = useState(params.q);
  const { data, isLoading } = useQuery({
    queryKey: ['seller', 'products', params],
    queryFn: () => api('/seller/products', { query: { ...TAB_QUERY[params.tab], q: params.q, page: params.page } }),
    placeholderData: (p) => p,
  });

  return (
    <div>
      <PageHeader title="Products" description="Add, edit and manage the products in your shop." actions={<Button icon={Plus} to="/seller/products/new">Add product</Button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={params.tab}
          onChange={(tab) => update({ tab })}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'live', label: 'Live' },
            { value: 'draft', label: 'Drafts' },
            { value: 'low', label: 'Low stock' },
            { value: 'out', label: 'Sold out' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <form onSubmit={(e) => { e.preventDefault(); update({ q: search }); }} className="flex gap-2 lg:w-80">
          <Input aria-label="Search products" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <Button type="submit" variant="outline" icon={Search} aria-label="Search" />
        </form>
      </div>
      {!isLoading && !data?.items.length && params.tab === 'all' && !params.q ? (
        <EmptyState icon={Package} title="No products yet" description="Add your first product with a few photos, a price and how many you have in stock." action={<Button icon={Plus} to="/seller/products/new">Add your first product</Button>} />
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items}
          pagination={data?.pagination}
          onPageChange={(p) => update({ page: String(p) })}
          onRowClick={(p) => navigate(`/seller/products/${p.id}`)}
          empty="No products match this filter."
          columns={[
            {
              key: 'name',
              header: 'Product',
              render: (p) => (
                <div className="flex items-center gap-3">
                  <ProductImage src={p.image} alt="" className="size-11 shrink-0 rounded-lg" />
                  <div className="min-w-0">
                    <p className="max-w-[260px] truncate font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.category}{p.sku && ` · ${p.sku}`}</p>
                  </div>
                </div>
              ),
            },
            { key: 'price', header: 'Price', render: (p) => <span className="tabular-nums">{money(p.price)}</span> },
            {
              key: 'stock',
              header: 'Stock',
              render: (p) => (
                <button type="button" onClick={(e) => { e.stopPropagation(); setStockFor(p); }} className="rounded-md px-2 py-1 text-left hover:bg-slate-100" title="Update stock">
                  <span className={p.stock === 0 ? 'font-semibold text-red-600' : p.lowStock ? 'font-semibold text-amber-700' : 'tabular-nums'}>{p.stock}</span>
                  <span className="ml-1 text-xs text-brand-700 underline">edit</span>
                </button>
              ),
            },
            { key: 'soldCount', header: 'Sold', hideOnMobile: true },
            {
              key: 'status',
              header: 'Status',
              render: (p) => (
                <div className="flex flex-wrap gap-1">
                  <StatusBadge status={p.status} />
                  {p.moderationStatus !== 'APPROVED' && <StatusBadge status={p.moderationStatus} label={p.moderationStatus === 'PENDING' ? 'In review' : undefined} />}
                  {p.ratingCount > 0 && <Badge>★ {p.ratingAvg.toFixed(1)}</Badge>}
                </div>
              ),
            },
          ]}
        />
      )}
      {stockFor && <StockModal product={stockFor} onClose={() => setStockFor(null)} />}
    </div>
  );
}
