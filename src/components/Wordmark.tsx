import { cn } from '@/lib/cn';

export function Wordmark({ className, accent = true }: { className?: string; accent?: boolean }) {
  return (
    <span className={cn('inline-flex items-baseline font-display font-extrabold uppercase leading-none tracking-[-0.04em]', className)}>
      MADE<span className="ml-[0.18em]">NEW</span>
      {accent && <span className="ml-[0.08em] inline-block h-[0.16em] w-[0.16em] bg-crimson" aria-hidden />}
    </span>
  );
}
