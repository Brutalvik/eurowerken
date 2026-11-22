/**
 * Pieces shared by the Repair Tracking and Repair Case pages, on real data
 * (src/api/repairs.ts): the lookup form, contact handling for this tab, the
 * status pill and timeline, the technician card, items with totals, workshop
 * updates and the photo and video grid.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Circle, Clock, ImageIcon, Loader2, NotebookPen, RotateCcw, Search, User, Wrench } from 'lucide-react';
import { DEFAULT_TIME_ZONE } from '@/api/booking';
import {
  STATUS_LABEL,
  STATUS_PROGRESS,
  STATUS_STEPS,
  forgetContact,
  itemAmount,
  mediaUrl,
  primeTrackedRepair,
  recallContact,
  rememberContact,
  repairTotals,
  technicianPhotoUrl,
  trackRepair,
} from '@/api/repairs';
import type { RepairEvent, RepairItem, RepairMedia, RepairStatus, RepairSummary, RepairTechnician, TrackedRepair } from '@/api/repairs';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { Photo } from '@/components/Photo';
import { Pill } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { useSite } from '@/site/SiteContext';

// Dates ----------------------------------------------------------------------------------

export function repairTimeZone(repair: Pick<RepairSummary, 'time_zone'>): string {
  const tz = repair.time_zone;
  if (!tz) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** "Nov 18, 9:30 a.m." in the workshop's time zone. */
export function formatWhen(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('en-CA', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Nov 18, 2026" in the workshop's time zone. */
export function formatDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
}

// Contact for a code -------------------------------------------------------------------------

export interface RepairContact {
  /** The contact to look the code up with, or null when the visitor has to type it. */
  contact: string | null;
  /** False while the sign-in state is still being checked. */
  ready: boolean;
  /** The contact is the signed-in account's email (not typed in this tab). */
  fromAccount: boolean;
  /** After a lookup with the form succeeded. */
  setTyped: (contact: string) => void;
  /** The server refused the contact: forget it, so the form shows. */
  reject: () => void;
}

/**
 * Which contact to use for a tracking code: one this tab already verified
 * (sessionStorage), else the signed-in customer's account email (the server
 * also accepts the owner's session). Never put in the URL.
 */
export function useRepairContact(code: string | null): RepairContact {
  const { status, account } = useCustomerAuth();
  const [typed, setTypedState] = useState<string | null>(() => (code ? recallContact(code) : null));
  const [rejected, setRejected] = useState(false);
  const [forCode, setForCode] = useState(code);
  if (forCode !== code) {
    setForCode(code);
    setTypedState(code ? recallContact(code) : null);
    setRejected(false);
  }

  const accountEmail = status === 'signed-in' && account?.email ? account.email : null;
  const fromAccount = !typed && !rejected && Boolean(accountEmail);
  const contact = typed ?? (fromAccount ? accountEmail : null);

  const setTyped = useCallback(
    (c: string) => {
      if (code) rememberContact(code, c);
      setTypedState(c.trim());
      setRejected(false);
    },
    [code],
  );
  const reject = useCallback(() => {
    if (code) forgetContact(code);
    setTypedState(null);
    setRejected(true);
  }, [code]);

  return { contact, ready: status !== 'loading', fromAccount, setTyped, reject };
}

// Lookup form ----------------------------------------------------------------------------------

/**
 * Tracking code and email or phone. On success the contact is kept for this
 * tab, the result is handed to useTrackedRepair, and onFound runs.
 * hero: on the dark hero band; plain: in a glass card.
 */
export function LookupForm({
  initialCode = '',
  lockCode = false,
  tone = 'plain',
  initialError = null,
  onFound,
}: {
  initialCode?: string;
  lockCode?: boolean;
  tone?: 'hero' | 'plain';
  initialError?: string | null;
  onFound: (code: string, contact: string, data: TrackedRepair) => void;
}) {
  const site = useSite();
  const [code, setCode] = useState(initialCode);
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [errorField, setErrorField] = useState<'id' | 'contact' | 'both' | null>(initialError ? 'both' : null);
  const [checking, setChecking] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const errorId = `${uid}-error`;

  useEffect(() => setCode(initialCode), [initialCode]);
  useEffect(() => {
    setError(initialError);
    setErrorField(initialError ? 'both' : null);
  }, [initialError]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const c = code.trim().toUpperCase();
    if (!c) {
      setError('Enter the tracking ID from your drop-off email or text.');
      setErrorField('id');
      idRef.current?.focus();
      return;
    }
    if (!contact.trim()) {
      setError('Enter the email address or phone number you booked with.');
      setErrorField('contact');
      contactRef.current?.focus();
      return;
    }
    setChecking(true);
    const res = await trackRepair(site.slug, c, contact);
    setChecking(false);
    if (res.error !== null) {
      setErrorField('both');
      setError(res.error);
      (lockCode ? contactRef : idRef).current?.focus();
      return;
    }
    rememberContact(res.data.repair.tracking_code, contact);
    primeTrackedRepair(res.data);
    onFound(res.data.repair.tracking_code, contact.trim(), res.data);
  }

  const hero = tone === 'hero';
  const labelClass = hero ? 'mb-1.5 block text-xs font-medium text-white/70' : 'label';
  const idInvalid = errorField === 'id' || errorField === 'both';
  const contactInvalid = errorField === 'contact' || errorField === 'both';

  return (
    <div>
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={checking}
        className={`${hero ? 'glass-dark' : 'glass'} mx-auto grid max-w-3xl gap-3 rounded-2xl p-4 text-left sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5`}
      >
        <div className="min-w-0">
          <label htmlFor={`${uid}-id`} className={labelClass}>
            Tracking ID <span aria-hidden>*</span>
          </label>
          <input
            ref={idRef}
            id={`${uid}-id`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            readOnly={lockCode}
            placeholder="EW-XXXXX-000"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            aria-invalid={idInvalid}
            aria-describedby={idInvalid && error ? errorId : undefined}
            className={`input font-mono ${lockCode ? 'opacity-80' : ''}`}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-contact`} className={labelClass}>
            Email or phone you booked with <span aria-hidden>*</span>
          </label>
          <input
            ref={contactRef}
            id={`${uid}-contact`}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            aria-invalid={contactInvalid}
            aria-describedby={contactInvalid && error ? errorId : undefined}
            className="input"
          />
        </div>
        <button type="submit" disabled={checking} className="btn-ink min-h-11 w-full bg-accent text-accent-fg shadow-accent/30 disabled:opacity-70 sm:w-auto">
          {checking ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {checking ? 'Looking up' : 'Look up'}
        </button>
        <p className={`text-[11px] leading-relaxed sm:col-span-3 ${hero ? 'text-white/60' : 'text-fg3'}`}>
          Your tracking ID is in the check-in email or text from the workshop. We only use your email or phone to check it is you.
        </p>
      </form>
      <div aria-live="polite" className="mx-auto max-w-3xl">
        {checking && <p className="sr-only">Looking up your repair.</p>}
        {error && (
          <p id={errorId} className="mt-4 flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-left text-sm text-bad">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Shown when a background refresh failed while older data is on screen. */
export function StaleNote({ onRetry }: { onRetry: () => void }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn">
      We could not refresh just now, so this may be a little out of date.
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold underline-offset-2 hover:underline">
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Try again
      </button>
    </p>
  );
}

// Status -----------------------------------------------------------------------------------------

const STATUS_TONE: Record<RepairStatus, 'accent' | 'ok' | 'warn' | 'neutral' | 'bad'> = {
  checked_in: 'neutral',
  diagnosing: 'accent',
  awaiting_approval: 'warn',
  in_progress: 'accent',
  quality_check: 'accent',
  ready: 'ok',
  completed: 'ok',
  cancelled: 'bad',
};

export function StatusPill({ status }: { status: RepairStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function ProgressBar({ status, label = 'Repair progress' }: { status: RepairStatus; label?: string }) {
  const value = STATUS_PROGRESS[status];
  return (
    <div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${value}%, ${STATUS_LABEL[status]}`} className="h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className={`h-full rounded-full ${status === 'ready' || status === 'completed' ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1.5 text-right text-[11px] font-medium text-fg3">{value}% complete</p>
    </div>
  );
}

// Timeline ---------------------------------------------------------------------------------------

type StepState = 'done' | 'current' | 'upcoming';

interface TimelineStep {
  status: RepairStatus;
  title: string;
  time: string | null;
  note: string;
  state: StepState;
}

const STEP_TITLE: Record<RepairStatus, string> = {
  checked_in: 'Vehicle checked in',
  diagnosing: 'Diagnosis',
  awaiting_approval: 'Estimate approval',
  in_progress: 'Repair in progress',
  quality_check: 'Quality check',
  ready: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STEP_NOTE: Record<RepairStatus, { done: string; current: string; upcoming: string }> = {
  checked_in: { done: 'Your vehicle was received.', current: 'Your vehicle is checked in and waiting for the technician.', upcoming: '' },
  diagnosing: { done: 'Inspection finished.', current: 'The technician is inspecting your vehicle.', upcoming: 'Inspection and diagnosis.' },
  awaiting_approval: {
    done: 'Estimate handled.',
    current: 'The workshop sent an estimate. Approve or decline the work waiting for you.',
    upcoming: 'If extra work is needed, you approve it here first.',
  },
  in_progress: { done: 'Repair work finished.', current: 'The work you approved is being done.', upcoming: 'The approved work is carried out.' },
  quality_check: { done: 'Checked and road tested.', current: 'Final inspection and road test.', upcoming: 'Final inspection and road test.' },
  ready: { done: 'Ready for pickup.', current: 'Your vehicle is ready. You can pick it up during opening hours.', upcoming: 'We let you know as soon as it is ready.' },
  completed: { done: 'Picked up. Thank you.', current: 'Picked up. Thank you.', upcoming: 'Pickup and handover.' },
  cancelled: { done: '', current: 'This repair was cancelled.', upcoming: '' },
};

/** The title the database writes into the timeline for each status (migration 012). */
const EVENT_TITLE: Partial<Record<RepairStatus, string>> = {
  checked_in: 'Vehicle checked in',
  diagnosing: 'Diagnosis started',
  awaiting_approval: 'Estimate sent for approval',
  in_progress: 'Repair in progress',
  quality_check: 'Quality check',
  ready: 'Ready for pickup',
  completed: 'Completed',
};

export function buildTimeline(tracked: TrackedRepair): TimelineStep[] {
  const { repair, events } = tracked;
  const tz = repairTimeZone(repair);
  const current = STATUS_STEPS.indexOf(repair.status as (typeof STATUS_STEPS)[number]);
  return STATUS_STEPS.map((status, i) => {
    // The latest timeline entry for this step: a status change, or the check-in itself.
    const ev = [...events]
      .reverse()
      .find((e) => (e.kind === 'status' && e.title === EVENT_TITLE[status]) || (status === 'checked_in' && e.kind === 'check_in'));
    const state: StepState =
      repair.status === 'completed' ? 'done' : i < current ? 'done' : i === current ? 'current' : 'upcoming';
    let time: string | null = ev ? formatWhen(ev.created_at, tz) : null;
    if (status === 'checked_in' && !time) time = formatWhen(repair.created_at, tz);
    if (status === 'completed' && repair.completed_at) time = formatWhen(repair.completed_at, tz);
    if (status === 'ready' && state === 'upcoming' && repair.promised_at) time = `Promised ${formatWhen(repair.promised_at, tz)}`;
    const note = state === 'done' && status === 'awaiting_approval' && !ev ? 'No extra approval was needed.' : STEP_NOTE[status][state];
    return { status, title: STEP_TITLE[status], time, note, state };
  });
}

export function RepairTimeline({ tracked }: { tracked: TrackedRepair }) {
  const steps = buildTimeline(tracked);
  const status = tracked.repair.status;
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.status} aria-current={s.state === 'current' ? 'step' : undefined} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span aria-hidden className={`absolute left-4 top-9 -ml-px h-[calc(100%-2.25rem)] w-0.5 ${s.state === 'done' ? 'bg-ok/50' : 'bg-line'}`} />
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
              {s.state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : s.state === 'current' ? <Wrench className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-sm font-semibold ${s.state === 'upcoming' ? 'text-fg3' : s.state === 'current' ? 'text-accent' : 'text-fg'}`}>
                {s.title}
                <span className="sr-only">{s.state === 'done' ? ' (completed)' : s.state === 'current' ? ' (current step)' : ' (upcoming)'}</span>
              </p>
              {s.time && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg3">
                  <Clock className="h-3 w-3" aria-hidden />
                  {s.time}
                </p>
              )}
              {s.state === 'current' ? (
                <div className="mt-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
                  <p className="text-xs leading-relaxed text-fg2">{s.note}</p>
                  <div className="mt-3">
                    <ProgressBar status={status} />
                  </div>
                </div>
              ) : (
                s.note && <p className={`mt-1 text-xs leading-relaxed ${s.state === 'upcoming' ? 'text-fg3' : 'text-fg2'}`}>{s.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Technician -------------------------------------------------------------------------------------

export function TechnicianCard({ technician, children }: { technician: RepairTechnician | null; children?: ReactNode }) {
  if (!technician) {
    return (
      <div>
        <p className="text-sm text-fg2">A technician will be assigned to your vehicle shortly.</p>
        {children}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        <Photo src={technicianPhotoUrl(technician.photo_path)} alt={technician.name} icon={User} className="h-12 w-12 shrink-0 overflow-hidden rounded-full" />
        <div className="min-w-0">
          <p className="break-words font-semibold text-fg">{technician.name}</p>
          <p className="text-xs text-fg3">{technician.role?.trim() || 'Technician'}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// Items and totals -------------------------------------------------------------------------------

const APPROVAL_PILL: Record<RepairItem['approval'], { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  approved: { label: 'Approved', tone: 'ok' },
  pending: { label: 'Needs approval', tone: 'warn' },
  declined: { label: 'Declined', tone: 'neutral' },
};

export function ApprovalPill({ approval }: { approval: RepairItem['approval'] }) {
  const p = APPROVAL_PILL[approval];
  return <Pill tone={p.tone}>{p.label}</Pill>;
}

/** Compact list of the work with an approval pill per line. */
export function ItemsSummary({ items }: { items: RepairItem[] }) {
  if (items.length === 0) return <p className="text-sm text-fg2">No work has been added yet. The estimate appears here once the technician has looked at your vehicle.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 text-sm ${
            item.approval === 'pending' ? 'border-warn/40 bg-warn/5' : 'border-line bg-surface2/50'
          }`}
        >
          <span className={`min-w-0 flex-1 break-words ${item.approval === 'declined' ? 'text-fg3 line-through' : 'text-fg'}`}>
            {item.description}
            {item.quantity !== 1 && <span className="text-fg3"> x {item.quantity}</span>}
          </span>
          {item.approval !== 'approved' && <ApprovalPill approval={item.approval} />}
          <span className={`shrink-0 tabular-nums ${item.approval === 'approved' ? 'font-semibold text-fg' : 'text-fg3'}`}>{formatMoney(itemAmount(item))}</span>
        </li>
      ))}
    </ul>
  );
}

export function Totals({ items }: { items: RepairItem[] }) {
  const t = repairTotals(items);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fg2">Approved work</dt>
          <dd className="tabular-nums text-fg">{formatMoney(t.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg2">GST (5%)</dt>
          <dd className="tabular-nums text-fg">{formatMoney(t.gst)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 pt-1">
          <dt className="font-medium text-fg">Total</dt>
          <dd className="font-display text-xl font-bold tabular-nums text-fg">{formatMoney(t.total)}</dd>
        </div>
      </dl>
      {t.pendingCount > 0 && (
        <p className="mt-2 text-xs text-warn">
          {t.pendingCount} {t.pendingCount === 1 ? 'item' : 'items'} ({formatMoney(t.pending)} before tax) {t.pendingCount === 1 ? 'is' : 'are'} waiting for your
          approval and not included.
        </p>
      )}
    </div>
  );
}

// Workshop updates (notes) --------------------------------------------------------------------------

/** Notes and approvals from the timeline, newest first (status changes are in the timeline above). */
export function WorkshopUpdates({ events, timeZone, limit }: { events: RepairEvent[]; timeZone: string; limit?: number }) {
  const notes = events.filter((e) => e.kind === 'note' || e.kind === 'approval').reverse();
  const shown = limit ? notes.slice(0, limit) : notes;
  if (shown.length === 0) return <p className="text-sm text-fg2">No notes yet. The technician's findings will appear here.</p>;
  return (
    <ul className="space-y-3">
      {shown.map((n) => (
        <li key={n.id} className="rounded-xl border border-line bg-surface2/60 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <NotebookPen className="h-4 w-4" aria-hidden />
            </span>
            <p className="min-w-0 text-sm">
              <span className="break-words font-semibold text-fg">{n.title}</span>
              <span className="block text-[11px] text-fg3">
                <time dateTime={n.created_at}>{formatWhen(n.created_at, timeZone)}</time>
              </span>
            </p>
          </div>
          {n.body && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg2">{n.body}</p>}
        </li>
      ))}
    </ul>
  );
}

// Photos and videos ------------------------------------------------------------------------------------

/** Photos open full size in a new tab; videos play inline. */
export function MediaGrid({ media, columns = 'sm:grid-cols-3 lg:grid-cols-4', limit }: { media: RepairMedia[]; columns?: string; limit?: number }) {
  const shown = limit ? media.slice(0, limit) : media;
  if (shown.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg2">
        <ImageIcon className="h-4 w-4 shrink-0 text-fg3" aria-hidden />
        No photos or videos yet. The technician adds them during the inspection.
      </p>
    );
  }
  return (
    <ul className={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${columns}`}>
      {shown.map((m, i) => {
        const url = mediaUrl(m.path);
        const label = m.caption?.trim() || (m.kind === 'video' ? `Video ${i + 1}` : `Photo ${i + 1}`);
        return (
          <li key={m.id} className="overflow-hidden rounded-xl border border-line bg-surface2/50">
            {m.kind === 'video' ? (
              <video src={url} controls playsInline preload="metadata" aria-label={`Video: ${label}`} className="aspect-[4/3] w-full bg-ink object-cover">
                <a href={url}>Download the video</a>
              </video>
            ) : (
              <a href={url} target="_blank" rel="noreferrer" className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <Photo src={url} alt={label} icon={ImageIcon} className="aspect-[4/3] w-full" />
                <span className="sr-only"> (opens full size in a new tab)</span>
              </a>
            )}
            <p className="break-words px-2.5 py-2 text-[11px] font-medium text-fg2">{label}</p>
          </li>
        );
      })}
    </ul>
  );
}
