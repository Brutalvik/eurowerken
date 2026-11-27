import type { ReactNode } from 'react';
import { AlertTriangle, Check, Circle, Info, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  ok: 'bg-ok/15 text-ok ring-ok/25',
  warn: 'bg-warn/15 text-warn ring-warn/25',
  bad: 'bg-bad/15 text-bad ring-bad/25',
  info: 'bg-accent/15 text-accent ring-accent/25',
  violet: 'bg-violet/15 text-violet ring-violet/25',
  neutral: 'bg-fg3/15 text-fg2 ring-fg3/25',
};

/** High contrast pairs every colour with a shape, so status never depends on colour alone. */
const TONE_ICONS: Record<Tone, LucideIcon> = {
  ok: Check,
  warn: AlertTriangle,
  bad: X,
  info: Info,
  violet: Sparkles,
  neutral: Circle,
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset [[data-contrast=high]_&]:bg-transparent [[data-contrast=high]_&]:ring-2 [[data-contrast=high]_&]:ring-current ${TONE_CLASSES[tone]}`}
    >
      <Icon className="hidden h-3 w-3 shrink-0 [[data-contrast=high]_&]:block" strokeWidth={3} aria-hidden />
      {children}
    </span>
  );
}
