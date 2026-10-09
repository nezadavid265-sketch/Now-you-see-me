import { Check, CircleX } from 'lucide-react';
import { cx } from './ui/index.jsx';
import { dateTime } from '../lib/format.js';

const STEPS = [
  { status: 'PLACED', label: 'Order placed' },
  { status: 'ACCEPTED', label: 'Accepted' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY', label: 'Packed' },
  { status: 'IN_TRANSIT', label: 'Out for delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
];
const ORDER = STEPS.map((s) => s.status);

/** Horizontal progress stepper for a shipment. */
export function ShipmentProgress({ status, events = [] }) {
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
        <CircleX className="size-4" /> {status === 'CANCELLED' ? 'This shipment was cancelled' : 'This shipment was refunded'}
      </div>
    );
  }
  const current = status === 'PENDING_PAYMENT' ? -1 : ORDER.indexOf(status);
  const when = (s) => events.filter((e) => e.status === s).at(-1)?.createdAt;
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Shipment progress">
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step.status} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cx('h-1 flex-1 rounded-full', i === 0 ? 'invisible' : done ? 'bg-brand-600' : 'bg-slate-200')} />
              <span
                className={cx(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500',
                  i === current && 'ring-4 ring-brand-100',
                )}
                aria-current={i === current ? 'step' : undefined}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cx('h-1 flex-1 rounded-full', i === STEPS.length - 1 ? 'invisible' : i < current ? 'bg-brand-600' : 'bg-slate-200')} />
            </div>
            <span className={cx('mt-1.5 text-[11px] leading-tight font-medium sm:text-xs', done ? 'text-slate-800' : 'text-slate-400')}>{step.label}</span>
            {done && when(step.status) && <span className="hidden text-[10px] text-slate-400 sm:block">{dateTime(when(step.status))}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Vertical list of status events. */
export function EventLog({ events, labels = {} }) {
  if (!events?.length) return <p className="text-sm text-slate-500">No updates yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.status}-${e.createdAt}-${i}`} className="relative">
          <span className={cx('absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-white', i === 0 ? 'bg-brand-600' : 'bg-slate-300')} />
          <p className="text-sm font-medium text-slate-800">{labels[e.status] ?? e.status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p>
          {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
          <p className="text-xs text-slate-400">
            {dateTime(e.createdAt)}
            {e.actorRole && ` · ${e.actorRole.toLowerCase()}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
