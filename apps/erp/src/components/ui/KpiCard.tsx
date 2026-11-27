import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** A short line under the value. Omit for the bare card (the Dashboard). */
  caption?: string;
  /** Percent change versus the previous period. Omit when not applicable. */
  change?: number;
}

export function KpiCard({ icon: Icon, label, value, caption, change }: KpiCardProps) {
  return (
    <div className="glass relative flex min-w-0 flex-col gap-2 rounded-2xl px-4 pb-4 pt-3.5 sm:px-5">
      {/* The soft light along the top edge, as in the mockup (hidden in high contrast, where panels are solid). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-10 -top-px h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent shadow-[0_0_16px_3px_rgb(170_200_255/0.45)] [[data-contrast=high]_&]:hidden"
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug text-fg sm:text-[15px]">{label}</span>
        <Icon className="h-6 w-6 shrink-0 text-fg2" strokeWidth={1.6} aria-hidden />
      </div>
      <div className="truncate font-display text-[28px] font-semibold leading-none tracking-tight text-fg sm:text-[34px]">{value}</div>
      {(caption || change !== undefined) && (
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
          {change !== undefined && (
            <span className={`font-semibold ${change >= 0 ? 'text-ok' : 'text-bad'}`}>
              {change >= 0 ? '▲ +' : '▼ -'}
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {caption && <span className="text-fg2">{caption}</span>}
        </div>
      )}
    </div>
  );
}
