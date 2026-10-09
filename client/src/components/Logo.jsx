import { Link } from 'react-router';
import { cx } from './ui/index.jsx';

/** Rivoshoppa mark: an "R" resting on a river wave. */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path d="M18 46V18h14a9 9 0 0 1 2.6 17.6L44 46" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 52c6-4 12-4 18 0s12 4 18 0" fill="none" stroke="#f2653a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ to = '/', inverted = false, subtitle, className }) {
  return (
    <Link to={to} className={cx('flex shrink-0 items-center gap-2', className)} aria-label="Rivoshoppa home">
      <LogoMark className={cx('size-9', inverted ? 'text-brand-950/40' : 'text-brand-700')} />
      <span className="leading-none">
        <span className={cx('block text-xl font-extrabold tracking-tight', inverted ? 'text-white' : 'text-brand-900')}>
          rivo<span className="text-accent-400">shoppa</span>
        </span>
        {subtitle && <span className={cx('mt-0.5 block text-[11px] font-semibold tracking-wider uppercase', inverted ? 'text-brand-100' : 'text-slate-500')}>{subtitle}</span>}
      </span>
    </Link>
  );
}
