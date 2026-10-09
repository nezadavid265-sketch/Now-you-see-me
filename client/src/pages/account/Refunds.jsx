import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { date, money } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { EmptyState, PageHeader, StatusBadge } from '../../components/ui/index.jsx';

export default function Refunds() {
  usePageTitle('Refunds');
  const { data, isLoading } = useQuery({ queryKey: ['refunds'], queryFn: () => api('/refunds') });
  return (
    <div>
      <PageHeader title="Refunds" description="Track refund requests and automatic refunds for cancelled orders." />
      {!isLoading && !data?.items.length ? (
        <EmptyState icon={RotateCcw} title="No refunds" description="Refund requests you make from your orders will appear here." />
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items}
          columns={[
            { key: 'order', header: 'Order', render: (r) => <Link to={`/account/orders/${r.orderId}`} className="font-semibold text-brand-700 hover:underline">{r.orderNumber}</Link> },
            { key: 'shop', header: 'Shop', render: (r) => r.shop ?? '—' },
            { key: 'reason', header: 'Reason' },
            { key: 'amount', header: 'Amount', render: (r) => <span className="tabular-nums">{money(r.amount)}</span> },
            { key: 'createdAt', header: 'Requested', render: (r) => date(r.createdAt) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}
