import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactMoney, money } from '../lib/format.js';

const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function ChartTooltip({ active, payload, label, valueLabel = 'Revenue', isMoney = true }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-pop ring-1 ring-slate-900/5">
      <p className="font-semibold text-slate-800">{shortDay(label)}</p>
      <p className="text-slate-600">
        {valueLabel}: <span className="font-semibold text-slate-900">{isMoney ? money(payload[0].value) : payload[0].value}</span>
      </p>
      {row.orders !== undefined && isMoney && <p className="text-slate-600">Orders: {row.orders}</p>}
    </div>
  );
}

/** Daily revenue area chart (series from the API: [{ day, revenue, orders }]). */
export function RevenueChart({ data, dataKey = 'revenue', height = 260, label = 'Revenue' }) {
  return (
    <div style={{ height }} role="img" aria-label={`${label} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#13a4a1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#13a4a1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v) => compactMoney(v, '')} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<ChartTooltip valueLabel={label} />} />
          <Area type="monotone" dataKey={dataKey} stroke="#0b6e75" strokeWidth={2} fill="url(#revFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OrdersBarChart({ data, height = 220 }) {
  return (
    <div style={{ height }} role="img" aria-label="Orders per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={<ChartTooltip valueLabel="Orders" isMoney={false} />} />
          <Bar dataKey="orders" fill="#f2653a" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Simple horizontal bars (no chart library) for distributions. */
export function DistributionBars({ items, max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600">{i.label}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(i.value / top) * 100}%` }} />
          </span>
          <span className="w-10 text-right font-semibold text-slate-700 tabular-nums">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
