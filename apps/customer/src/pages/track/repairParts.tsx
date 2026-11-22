/**
 * Pieces shared by the Repair Tracking and Repair Case Details pages:
 * status pill, the vertical repair timeline, technician notes, the photo
 * grid, and the contact check used by the lookup.
 */
import { CheckCircle2, Circle, Clock, ImageIcon, Play, User, Video, Wrench } from 'lucide-react';
import { Photo } from '@/components/Photo';
import { Pill } from '@/components/ui';
import type { RepairCase } from '@/data/catalog';

const STATUS_TONE: Record<RepairCase['status'], 'accent' | 'ok' | 'warn'> = {
  'In Progress': 'accent',
  'Ready for Pickup': 'ok',
  'Awaiting Approval': 'warn',
};

export function StatusPill({ status }: { status: RepairCase['status'] }) {
  return <Pill tone={STATUS_TONE[status]}>{status}</Pill>;
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

/** The contact typed in the lookup matches the case: email (any case) or the phone digits. */
export function contactMatches(repair: RepairCase, input: string): boolean {
  const typed = input.trim().toLowerCase();
  if (!typed) return false;
  if (typed === repair.contact.trim().toLowerCase()) return true;
  const typedDigits = digits(typed);
  const caseDigits = digits(repair.contact);
  // Last ten digits, so a leading country code (+1) still matches.
  return typedDigits.length >= 7 && caseDigits.length >= 7 && typedDigits.slice(-10) === caseDigits.slice(-10);
}

/** Total of the work that is approved or under way (items awaiting a decision are left out). */
export function committedTotal(items: RepairCase['lineItems']): number {
  return items.filter((i) => i.state === 'completed' || i.state === 'in-progress').reduce((sum, i) => sum + i.price, 0);
}

/** Vertical timeline: done, the current step (with a progress bar), then upcoming steps. */
export function RepairTimeline({ steps, progress }: { steps: RepairCase['timeline']; progress: number }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.title} aria-current={s.state === 'current' ? 'step' : undefined} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={`absolute left-4 top-9 -ml-px h-[calc(100%-2.25rem)] w-0.5 ${s.state === 'done' ? 'bg-ok/50' : 'bg-line'}`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                s.state === 'done'
                  ? 'bg-ok/15 text-ok'
                  : s.state === 'current'
                    ? 'bg-accent text-accent-fg shadow-md shadow-accent/20 ring-4 ring-accent/15'
                    : 'border border-line bg-surface2 text-fg3'
              }`}
            >
              {s.state === 'done' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : s.state === 'current' ? (
                <Wrench className="h-4 w-4" />
              ) : (
                <Circle className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-sm font-semibold ${s.state === 'upcoming' ? 'text-fg3' : s.state === 'current' ? 'text-accent' : 'text-fg'}`}>
                {s.title}
                <span className="sr-only">{s.state === 'done' ? ' (completed)' : s.state === 'current' ? ' (current step)' : ' (upcoming)'}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg3">
                <Clock className="h-3 w-3" aria-hidden />
                {s.time}
              </p>
              {s.state === 'current' ? (
                <div className="mt-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
                  <p className="text-xs leading-relaxed text-fg2">{s.note}</p>
                  <div
                    role="progressbar"
                    aria-label="Repair progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface2"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1.5 text-right text-[11px] font-medium text-fg3">{progress}% complete</p>
                </div>
              ) : (
                <p className={`mt-1 text-xs leading-relaxed ${s.state === 'upcoming' ? 'text-fg3' : 'text-fg2'}`}>{s.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TechnicianNotes({ notes }: { notes: RepairCase['notes'] }) {
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <li key={n.time + n.text.slice(0, 20)} className="rounded-xl border border-line bg-surface2/60 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <User className="h-4 w-4" aria-hidden />
            </span>
            <p className="min-w-0 text-sm">
              <span className="font-semibold text-fg">{n.author}</span> <span className="text-xs text-fg3">{n.role}</span>
              <span className="block text-[11px] text-fg3">{n.time}</span>
            </p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-fg2">{n.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Inspection photos and videos. Videos get a play icon over the frame. */
export function MediaGrid({ media, columns = 'sm:grid-cols-4' }: { media: RepairCase['media']; columns?: string }) {
  return (
    <ul className={`grid grid-cols-2 gap-3 ${columns}`}>
      {media.map((m) => (
        <li key={m.image} className="relative overflow-hidden rounded-xl border border-line">
          <Photo
            name={m.image}
            alt={m.video ? `Video: ${m.label}` : m.label}
            icon={m.video ? Video : ImageIcon}
            label={`${m.image}.jpg`}
            className="aspect-[4/3] w-full"
          />
          {m.video && (
            <span aria-hidden className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md shadow-accent/20">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sidebar/85 to-transparent px-2.5 pb-2 pt-6 text-[11px] font-medium text-white">
            {m.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
