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
    <div className="glass relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-2xl p-4 sm:gap-3 sm:p-5">
      {/* A soft specular line along the top edge (hidden in high contrast, where the glass is solid). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-accent/70 to-transparent shadow-[0_0_14px_2px_rgb(var(--accent)/0.45)] [[data-contrast=high]_&]:hidden"
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-snug text-fg2 sm:text-[13px]">{label}</span>
        <Icon className="h-5 w-5 shrink-0 text-fg2" aria-hidden />
      </div>
      <div className="truncate font-display text-2xl font-semibold leading-none tracking-tight text-fg sm:text-[28px]">{value}</div>
      <div className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
        {change !== undefined && (
          <span className={`font-semibold ${change >= 0 ? 'text-ok' : 'text-bad'}`}>
            {change >= 0 ? '▲ +' : '▼ -'}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        <span className="text-fg3">{caption}</span>
      </div>
    </div>
  );
}
