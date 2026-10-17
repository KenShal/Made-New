import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, useId } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatMoney, type Money } from '@shared/money';
import { STATUS_LABELS, type DesignStatus } from '@shared/lifecycle';
import { progressFill, statusChange } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger';
const base =
  'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-display text-[0.82rem] font-bold uppercase tracking-[0.14em] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-crimson';
const variants: Record<Variant, string> = {
  primary: 'bg-crimson text-white hover:bg-crimson-deep px-7 h-12',
  secondary: 'border border-ink text-ink hover:bg-ink hover:text-white px-7 h-12',
  ghost: 'text-ink hover:text-crimson px-1 h-10 underline-offset-[6px] hover:underline',
  inverse: 'bg-white text-crimson-deep hover:bg-crimson-blush px-7 h-12',
  danger: 'border border-crimson text-crimson hover:bg-crimson hover:text-white px-6 h-11',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }>(
  function Button({ variant = 'primary', busy, className, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} className={cn(base, variants[variant], className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
        {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
        {children}
      </button>
    );
  },
);

export function ButtonLink({ variant = 'primary', className, children, ...rest }: LinkProps & { variant?: Variant }) {
  return (
    <Link className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </Link>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 10" className={cn('h-2.5 w-5 transition-transform duration-300 ease-editorial group-hover:translate-x-1', className)} aria-hidden>
      <path d="M0 5h18M14 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-frame px-4 sm:px-8 lg:px-12', className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-display text-[0.7rem] font-bold uppercase tracking-editorial text-ink-muted', className)}>{children}</p>;
}

export function SampleBadge({ className, label = 'Sample data' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 border border-dashed border-ink-muted/50 bg-white/80 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-muted', className)} title="Illustrative development data, not real transactions">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-muted" aria-hidden />
      {label}
    </span>
  );
}

export function Price({ value, className }: { value: Money; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(value)}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border border-line bg-soft px-6 py-12 sm:px-10">
      <span className="h-1 w-10 bg-crimson" aria-hidden />
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      {body && <p className="max-w-md text-ink-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border border-crimson/40 bg-crimson-blush px-6 py-8">
      <p className="font-display text-lg font-bold">We couldn&rsquo;t load this.</p>
      <p className="text-sm text-ink-muted">{error.message}</p>
      {onRetry && (
        <Button variant="secondary" className="h-10 px-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: DesignStatus }) {
  const tone: Record<DesignStatus, string> = {
    draft: 'border-line text-ink-muted',
    submitted: 'border-ink/30 text-ink',
    under_review: 'border-ink text-ink',
    changes_requested: 'border-crimson text-crimson',
    approved: 'border-emerald-700 text-emerald-800',
    published: 'border-ink bg-ink text-white',
    rejected: 'border-crimson bg-crimson text-white',
    archived: 'border-line bg-soft text-ink-muted',
  };
  return (
    <motion.span key={status} {...statusChange} className={cn('inline-flex items-center border px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.12em]', tone[status])}>
      {STATUS_LABELS[status]}
    </motion.span>
  );
}

export function Progress({ value, goal, label }: { value: number; goal: number; label: string }) {
  const pct = goal > 0 ? value / goal : 0;
  return (
    <div>
      <div className="h-[3px] w-full overflow-hidden bg-line" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, pct) * 100)}>
        <motion.div className="h-full origin-left bg-crimson" {...progressFill(pct)} />
      </div>
    </div>
  );
}

/* ------------------------------- Form fields ------------------------------- */

interface FieldShell {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

function Shell({ id, label, hint, error, optional, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-semibold text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-muted">Optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-crimson">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = 'h-12 w-full border border-line bg-white px-4 text-[0.95rem] text-ink placeholder:text-ink-muted/70 transition-colors focus:border-ink focus:outline-none aria-[invalid=true]:border-crimson';

export function TextField({ label, hint, error, optional, className, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={cn(inputCls, className)} {...rest} />
    </Shell>
  );
}

export function TextArea({ label, hint, error, optional, className, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={cn(inputCls, 'h-auto min-h-[7rem] py-3', className)} {...rest} />
    </Shell>
  );
}

export function SelectField({ label, hint, error, optional, className, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select id={id} aria-invalid={Boolean(error)} className={cn(inputCls, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 10 6%27%3E%3Cpath d=%27M1 1l4 4 4-4%27 fill=%27none%27 stroke=%27%23171717%27/%3E%3C/svg%3E")] bg-[length:10px] bg-[right_1rem_center] bg-no-repeat pr-10', className)} {...rest}>
        {children}
      </select>
    </Shell>
  );
}

export function Checkbox({ label, error, ...rest }: { label: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input id={id} type="checkbox" aria-invalid={Boolean(error)} className="mt-1 h-4 w-4 shrink-0 accent-crimson" {...rest} />
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="ml-7 mt-1 text-xs font-medium text-crimson">
          {error}
        </p>
      )}
    </div>
  );
}
