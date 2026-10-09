import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Landmark, PiggyBank, Wallet } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PAYMENT_METHODS, date, dateTime, money, titleCase } from '../../lib/format.js';
import { usePageTitle } from '../../hooks/index.js';
import { useConfig } from '../../context/ConfigContext.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Alert, Badge, Button, Card, CardHeader, PageHeader, PageLoader, Stat, StatusBadge } from '../../components/ui/index.jsx';

const TYPE_TONE = { EARNING: 'green', REFUND_DEDUCTION: 'red', PAYOUT: 'blue', PAYOUT_REVERSAL: 'violet', ADJUSTMENT: 'slate' };

export default function Finance() {
  usePageTitle('Earnings & payouts');
  const config = useConfig();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['seller', 'finance', page], queryFn: () => api('/seller/finance', { query: { page } }), placeholderData: (p) => p });
  if (isLoading) return <PageLoader />;
  const b = data.balance;
  return (
    <div className="space-y-6">
      <PageHeader title="Earnings & payouts" description="Your earnings are released after delivery and the refund window, then paid out by Rivoshoppa." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available for payout" value={money(b.available)} icon={Wallet} tone="green" />
        <Stat label="On hold" value={money(b.pending)} hint={`Released ${config.refundWindowDays} days after delivery`} icon={Clock} tone="amber" />
        <Stat label="Total earned" value={money(b.totalEarned)} icon={PiggyBank} />
        <Stat label="Paid out" value={money(b.totalPaidOut)} icon={Landmark} tone="violet" />
      </div>
      {b.available < 0 && (
        <Alert tone="warning" title="You owe commission">
          Commission on cash-on-delivery orders you delivered yourself is deducted from future earnings.
        </Alert>
      )}
      <Card>
        <CardHeader title="Payout account" action={<Button variant="outline" size="sm" to="/seller/settings?tab=business">Change</Button>} />
        {data.payoutAccount?.accountNumber ? (
          <p className="text-sm text-slate-700">{PAYMENT_METHODS[data.payoutAccount.method]} · {data.payoutAccount.accountName} · <span className="font-semibold">{data.payoutAccount.accountNumber}</span></p>
        ) : (
          <Alert tone="warning">Add your payout details so we can send your earnings.</Alert>
        )}
      </Card>
      <div>
        <h2 className="mb-3 text-base font-semibold">Payouts</h2>
        <DataTable
          rows={data.payouts}
          empty="No payouts yet. Payouts are processed regularly once you have an available balance."
          columns={[
            { key: 'createdAt', header: 'Date', render: (p) => date(p.createdAt) },
            { key: 'amount', header: 'Amount', render: (p) => <span className="font-semibold tabular-nums">{money(p.amount)}</span> },
            { key: 'method', header: 'To', render: (p) => `${PAYMENT_METHODS[p.method]} · ${p.accountNumber ?? ''}` },
            { key: 'reference', header: 'Reference', render: (p) => p.reference ?? '—' },
            { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          ]}
        />
      </div>
      <div>
        <h2 className="mb-3 text-base font-semibold">Transactions</h2>
        <DataTable
          rows={data.ledger.items}
          pagination={data.ledger.pagination}
          onPageChange={setPage}
          empty="No transactions yet."
          columns={[
            { key: 'createdAt', header: 'Date', render: (e) => dateTime(e.createdAt) },
            { key: 'type', header: 'Type', render: (e) => <Badge tone={TYPE_TONE[e.type]}>{titleCase(e.type)}</Badge> },
            { key: 'description', header: 'Description' },
            { key: 'availableAt', header: 'Available from', hideOnMobile: true, render: (e) => (new Date(e.availableAt) > new Date() ? date(e.availableAt) : 'Available') },
            { key: 'amount', header: 'Amount', render: (e) => <span className={`font-semibold tabular-nums ${e.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{e.amount > 0 ? '+' : ''}{money(e.amount)}</span> },
          ]}
        />
      </div>
    </div>
  );
}
