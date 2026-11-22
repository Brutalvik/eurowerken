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
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg2">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="font-display text-2xl font-semibold leading-none text-fg">{value}</div>
      <div className="flex items-center gap-1.5 text-[11px]">
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
