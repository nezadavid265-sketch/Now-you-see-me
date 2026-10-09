import { forwardRef, useId, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Eye, EyeOff, Info, LoaderCircle, Minus, Plus, Star, TriangleAlert } from 'lucide-react';
import { STATUS } from '../../lib/format.js';

export const cx = (...classes) => classes.flat().filter(Boolean).join(' ');

// ── Buttons ───────────────────────────────────────────────────────────

const VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 shadow-sm',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  'danger-outline': 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};
const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, to, href, className, children, icon: Icon, type = 'button', ...props },
  ref,
) {
  const classes = cx(
    'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  const content = (
    <>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </>
  );
  if (to) return <Link ref={ref} to={to} className={classes} {...props}>{content}</Link>;
  if (href) return <a ref={ref} href={href} className={classes} {...props}>{content}</a>;
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  );
});

export function IconButton({ label, icon: Icon, className, badge, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('relative inline-flex size-10 items-center justify-center rounded-full transition-colors', className)} {...props}>
      <Icon className="size-5" aria-hidden />
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}

// ── Form controls ─────────────────────────────────────────────────────

const fieldBase =
  'block w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500';
const fieldTone = (error) => (error ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100');

export function Field({ label, hint, error, required, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-sm text-red-600" role="alert">
          <CircleAlert className="size-3.5" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, hint, error, required, className, inputClassName, prefix, suffix, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={inputId}>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 text-sm text-slate-500">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          required={required}
          className={cx(fieldBase, fieldTone(error), 'h-10', prefix && 'pl-12', suffix && 'pr-14', inputClassName)}
          {...props}
        />
        {suffix && <span className="absolute right-3 text-sm text-slate-500">{suffix}</span>}
      </div>
    </Field>
  );
});

export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} inputClassName="pr-11" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className={cx('absolute right-2.5 rounded p-1 text-slate-400 hover:text-slate-600', props.label ? 'top-[34px]' : 'top-2')}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export const Textarea = forwardRef(function Textarea({ label, hint, error, required, className, rows = 4, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={inputId}>
      <textarea ref={ref} id={inputId} rows={rows} aria-invalid={Boolean(error) || undefined} className={cx(fieldBase, fieldTone(error), 'py-2.5')} {...props} />
    </Field>
  );
});

export const Select = forwardRef(function Select({ label, hint, error, required, className, children, options, placeholder, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={inputId}>
      <select ref={ref} id={inputId} aria-invalid={Boolean(error) || undefined} className={cx(fieldBase, fieldTone(error), 'h-10 pr-8')} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
    </Field>
  );
});

export function Checkbox({ label, description, className, ...props }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-2.5', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 rounded border-slate-300 accent-brand-700" {...props} />
      <span className="text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, size = 'md', disabled }) {
  const h = size === 'sm' ? 'h-8' : 'h-10';
  return (
    <div className={cx('inline-flex items-center rounded-lg border border-slate-300 bg-white', h)}>
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className="flex h-full w-9 items-center justify-center text-slate-600 hover:text-brand-700 disabled:opacity-40" aria-label="Decrease quantity">
        <Minus className="size-4" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className="flex h-full w-9 items-center justify-center text-slate-600 hover:text-brand-700 disabled:opacity-40" aria-label="Increase quantity">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ── Display ───────────────────────────────────────────────────────────

export function Card({ className, children, padded = true, ...props }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white shadow-card', padded && 'p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx('mb-4 flex items-start justify-between gap-4', className)}>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  accent: 'bg-accent-50 text-accent-700 ring-accent-200',
};

export function Badge({ tone = 'slate', className, children }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export function StatusBadge({ status, label, className }) {
  const s = STATUS[status] ?? { label: status, tone: 'slate' };
  return (
    <Badge tone={s.tone} className={className}>
      {label ?? s.label}
    </Badge>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cx('size-5 animate-spin text-brand-600', className)} aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <Spinner className="size-7" />
      {label}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="size-7" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const ALERT = {
  info: { icon: Info, cls: 'bg-sky-50 text-sky-900 ring-sky-200', iconCls: 'text-sky-600' },
  success: { icon: CircleCheck, cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200', iconCls: 'text-emerald-600' },
  warning: { icon: TriangleAlert, cls: 'bg-amber-50 text-amber-900 ring-amber-200', iconCls: 'text-amber-600' },
  error: { icon: CircleAlert, cls: 'bg-red-50 text-red-900 ring-red-200', iconCls: 'text-red-600' },
};

export function Alert({ tone = 'info', title, children, action, className }) {
  const { icon: Icon, cls, iconCls } = ALERT[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl p-4 ring-1 ring-inset', cls, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className={cx('mt-0.5 size-5 shrink-0', iconCls)} aria-hidden />
      <div className="flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Stars({ value = 0, size = 'sm', showValue = false, count }) {
  const px = size === 'lg' ? 'size-5' : size === 'md' ? 'size-4' : 'size-3.5';
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Rated ${value} out of 5`}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cx(px, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200')} aria-hidden />
        ))}
      </span>
      {showValue && <span className="text-sm font-semibold text-slate-700">{Number(value).toFixed(1)}</span>}
      {count !== undefined && <span className="text-xs text-slate-500">({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const labels = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];
  return (
    <div className="flex items-center gap-3">
      <div className="flex" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? 's' : ''}`} onMouseEnter={() => setHover(i)} onClick={() => onChange(i)} className="p-0.5">
            <Star className={cx('size-8 transition-colors', i <= (hover || value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200')} />
          </button>
        ))}
      </div>
      <span className="text-sm font-medium text-slate-600">{labels[(hover || value) - 1] ?? 'Select a rating'}</span>
    </div>
  );
}

export function PageHeader({ title, description, actions, back, className }) {
  return (
    <div className={cx('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700">
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = 'brand', to }) {
  const toneCls = { brand: 'bg-brand-50 text-brand-700', accent: 'bg-accent-50 text-accent-600', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700', violet: 'bg-violet-50 text-violet-700', slate: 'bg-slate-100 text-slate-600' }[tone];
  const body = (
    <Card className={cx('h-full', to && 'transition-shadow hover:shadow-pop')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && (
          <div className={cx('flex size-10 shrink-0 items-center justify-center rounded-lg', toneCls)}>
            <Icon className="size-5" aria-hidden />
          </div>
        )}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Pagination({ pagination, onChange, className }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, pageSize } = pagination;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className={cx('flex items-center justify-between gap-4 pt-4', className)} aria-label="Pagination">
      <p className="text-sm text-slate-500">
        <span className="font-medium text-slate-700">{from}</span>–<span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-sm text-slate-600">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && (
            <span className={cx('rounded-full px-1.5 py-0.5 text-[11px] font-bold', value === t.value ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600', t.highlight && t.count > 0 && 'bg-accent-500 text-white')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Price({ amount, compareAt, currency = 'RWF', size = 'md' }) {
  const main = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl', xl: 'text-3xl' }[size];
  const off = compareAt && compareAt > amount ? Math.round(((compareAt - amount) / compareAt) * 100) : 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cx('font-bold text-slate-900 tabular-nums', main)}>
        {Number(amount).toLocaleString('en-US')} <span className="text-[0.7em] font-semibold text-slate-500">{currency}</span>
      </span>
      {off > 0 && (
        <>
          <span className="text-sm text-slate-400 line-through tabular-nums">{Number(compareAt).toLocaleString('en-US')}</span>
          <span className="text-xs font-bold text-accent-600">−{off}%</span>
        </>
      )}
    </div>
  );
}

export function DescriptionList({ items, className }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {items.filter(Boolean).map(([term, value]) => (
        <div key={term} className="min-w-0">
          <dt className="text-slate-500">{term}</dt>
          <dd className="mt-0.5 font-medium break-words text-slate-900">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
