import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, CircleCheck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { dateTime, titleCase } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ProductImage } from '../../components/ProductCard.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton } from '../../components/ui/index.jsx';

function RestockRow({ product }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(String(Math.max(product.stock, product.lowStockThreshold * 3, 10)));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/seller/products/${product.id}/stock`, { method: 'PUT', body: { quantity: Number(qty), note: 'Restocked' } });
      toast.success(`${product.name} restocked`);
      queryClient.invalidateQueries({ queryKey: ['seller'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <ProductImage src={product.image} alt="" className="size-11 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Link to={`/seller/products/${product.id}`} className="truncate text-sm font-medium hover:text-brand-700">{product.name}</Link>
        <p className="text-xs text-slate-500">Alert at {product.lowStockThreshold}</p>
      </div>
      <Badge tone={product.stock === 0 ? 'red' : 'amber'}>{product.stock === 0 ? 'Sold out' : `${product.stock} left`}</Badge>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`qty-${product.id}`}>New stock level</label>
        <input id={`qty-${product.id}`} type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-20 rounded-lg border border-slate-300 px-2 text-sm" />
        <Button size="sm" onClick={save} loading={busy}>Set stock</Button>
      </div>
    </li>
  );
}

export default function Inventory() {
  usePageTitle('Inventory');
  const [page, setPage] = useState(1);
  const low = useQuery({ queryKey: ['seller', 'products', 'low'], queryFn: () => api('/seller/products', { query: { stock: 'low', pageSize: 50 } }) });
  const movements = useQuery({ queryKey: ['seller', 'movements', page], queryFn: () => api('/seller/inventory/movements', { query: { page } }), placeholderData: (p) => p });

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Keep stock levels accurate so buyers never order something you don’t have." />
      <Card>
        <CardHeader title="Needs restocking" description="Products at or below their low-stock alert." />
        {low.isLoading ? (
          <Skeleton className="h-20" />
        ) : low.data.items.length ? (
          <ul className="divide-y divide-slate-100">{low.data.items.map((p) => <RestockRow key={p.id} product={p} />)}</ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-700"><CircleCheck className="size-4" /> Everything is well stocked.</p>
        )}
      </Card>
      <div>
        <h2 className="mb-3 text-base font-semibold">Stock history</h2>
        {!movements.isLoading && !movements.data?.items.length ? (
          <EmptyState icon={Boxes} title="No stock changes yet" />
        ) : (
          <DataTable
            loading={movements.isLoading}
            rows={movements.data?.items}
            pagination={movements.data?.pagination}
            onPageChange={setPage}
            columns={[
              { key: 'createdAt', header: 'When', render: (m) => dateTime(m.createdAt) },
              { key: 'product', header: 'Product', render: (m) => <span className="font-medium">{m.product.name}</span> },
              { key: 'reason', header: 'Reason', render: (m) => <Badge tone={m.reason === 'ORDER' ? 'blue' : m.reason === 'CANCELLATION' || m.reason === 'RETURN' ? 'violet' : 'slate'}>{titleCase(m.reason)}</Badge> },
              { key: 'change', header: 'Change', render: (m) => <span className={m.change > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>{m.change > 0 ? `+${m.change}` : m.change}</span> },
              { key: 'quantityAfter', header: 'Stock after' },
              { key: 'note', header: 'Note', hideOnMobile: true, render: (m) => <span className="text-slate-500">{m.note ?? '—'}</span> },
            ]}
          />
        )}
      </div>
    </div>
  );
}
