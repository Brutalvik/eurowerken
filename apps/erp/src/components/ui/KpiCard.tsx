import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  /** Percent change versus the previous period. Omit when not applicable. */
  change?: number;
}

export function KpiCard({ icon: Icon, label, value, caption, change }: KpiCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 glass rounded-xl p-4 sm:gap-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-snug text-fg2">{label}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent sm:h-8 sm:w-8">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="truncate font-display text-xl font-semibold leading-none text-fg sm:text-2xl">{value}</div>
      <div className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
        {change !== undefined && (
          <span className={`font-semibold ${change >= 0 ? 'text-ok' : 'text-bad'}`}>
            {change >= 0 ? '+' : '-'}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        <span className="text-fg3">{caption}</span>
      </div>
    </div>
  );
}
