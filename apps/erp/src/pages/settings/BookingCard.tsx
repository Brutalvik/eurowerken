import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  COMMON_TIME_ZONES,
  SLOT_MINUTES,
  WEEKDAY_NAMES,
  addClosure,
  errorMessage,
  formatDayKey,
  getBookingContext,
  removeClosure,
  saveBookingSettings,
  saveHours,
  settingsDraft,
  todayKey,
  upcomingClosures,
  validateHours,
  validateSettings,
} from '@/api/appointments';
import type { BookingContext, Closure, SettingsDraft, WorkshopHours } from '@/api/appointments';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CheckRow, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';

/** Monday first, as a workshop reads its week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Saved({ text }: { text: string | null }) {
  return (
    <span role="status" aria-live="polite" className="text-xs text-ok">
      {text}
    </span>
  );
}

/**
 * Online booking rules: time zone, slot length, bays, notice, how far ahead
 * and auto-confirm; the weekly hours; closed dates. Editing needs full
 * Settings access (enforced by RLS); everyone else sees them read-only.
 */
export function BookingCard() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const [ctx, setCtx] = useState<BookingContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    setError(null);
    try {
      setCtx(await getBookingContext(workshopId));
    } catch (err) {
      setError(errorMessage(err, 'The booking settings could not be loaded.'));
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card className="max-w-3xl space-y-3 p-4 sm:p-5">
        <ErrorNote errors={error} />
        <Button variant="ghost" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  }
  if (!ctx || !workshopId) {
    return (
      <p role="status" className="py-10 text-center text-xs text-fg2">
        Loading booking settings...
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {!canEdit && (
        <p className="rounded-lg border border-line bg-surface2/60 px-3 py-2 text-xs text-fg2">
          You can view these settings. Changing them needs full Settings access.
        </p>
      )}
      <SettingsForm
        workshopId={workshopId}
        ctx={ctx}
        canEdit={canEdit}
        onSaved={(settings) => setCtx((c) => (c ? { ...c, settings, settingsSaved: true } : c))}
      />
      <HoursForm workshopId={workshopId} hours={ctx.hours} canEdit={canEdit} onSaved={(hours) => setCtx((c) => (c ? { ...c, hours } : c))} />
      <ClosuresCard
        workshopId={workshopId}
        closures={ctx.closures}
        tz={ctx.settings.time_zone}
        canEdit={canEdit}
        onChange={(closures) => setCtx((c) => (c ? { ...c, closures } : c))}
      />
    </div>
  );
}

function SettingsForm({
  workshopId,
  ctx,
  canEdit,
  onSaved,
}: {
  workshopId: string;
  ctx: BookingContext;
  canEdit: boolean;
  onSaved: (s: BookingContext['settings']) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<SettingsDraft>(() => settingsDraft(ctx.settings));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const set = (patch: Partial<SettingsDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateSettings(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const s = await saveBookingSettings(workshopId, result.value);
      onSaved(s);
      setDraft(settingsDraft(s));
      setSaved('Booking settings saved.');
    } catch (err) {
      setErrors([errorMessage(err, 'The settings were not saved.')]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Card className="p-4 sm:p-5">
        <CardHeader
          title="Online booking"
          subtitle={ctx.settingsSaved ? 'How customers book on your website' : 'Defaults shown. Save to keep them.'}
        />
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled id={`${id}-zone`} label="Time zone" hint="All booking times use this zone.">
              <select id={`${id}-zone`} value={draft.zone_choice} onChange={(e) => set({ zone_choice: e.target.value })} className={inputClass}>
                {COMMON_TIME_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
                <option value="other">Other (type it)</option>
              </select>
            </Labeled>
            {draft.zone_choice === 'other' && (
              <Labeled id={`${id}-zone-other`} label="Time zone name" hint="An IANA name, for example America/Moncton.">
                <input
                  id={`${id}-zone-other`}
                  value={draft.zone_other}
                  onChange={(e) => set({ zone_other: e.target.value })}
                  className={inputClass}
                  placeholder="America/Moncton"
                />
              </Labeled>
            )}
            <Labeled id={`${id}-slot`} label="Slot length" hint="Start times are offered this far apart.">
              <select id={`${id}-slot`} value={draft.slot_minutes} onChange={(e) => set({ slot_minutes: e.target.value })} className={inputClass}>
                {SLOT_MINUTES.map((m) => (
                  <option key={m} value={String(m)}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled id={`${id}-bays`} label="Bays" hint="How many cars can be booked at the same time (1 to 50).">
              <input id={`${id}-bays`} inputMode="numeric" value={draft.bays} onChange={(e) => set({ bays: e.target.value })} className={inputClass} />
            </Labeled>
            <Labeled id={`${id}-notice`} label="Minimum notice (hours)" hint="How soon a customer can book, 0 to 168.">
              <input
                id={`${id}-notice`}
                inputMode="numeric"
                value={draft.min_notice_hours}
                onChange={(e) => set({ min_notice_hours: e.target.value })}
                className={inputClass}
              />
            </Labeled>
            <Labeled id={`${id}-ahead`} label="Booking window (days ahead)" hint="How far ahead customers can book, 1 to 365.">
              <input
                id={`${id}-ahead`}
                inputMode="numeric"
                value={draft.max_days_ahead}
                onChange={(e) => set({ max_days_ahead: e.target.value })}
                className={inputClass}
              />
            </Labeled>
          </div>
          <CheckRow
            id={`${id}-auto`}
            label="Confirm online bookings automatically"
            hint="On: a booking is confirmed the moment the customer books, if the time is free. Off: it arrives as Requested and staff confirm or decline it in Appointments."
            checked={draft.auto_confirm}
            onChange={(v) => set({ auto_confirm: v })}
          />
        </fieldset>
        <div className="mt-4 space-y-3">
          <ErrorNote errors={errors} />
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save booking settings'}
              </Button>
              <Saved text={saved} />
            </div>
          )}
        </div>
      </Card>
    </form>
  );
}

function HoursForm({
  workshopId,
  hours,
  canEdit,
  onSaved,
}: {
  workshopId: string;
  hours: WorkshopHours[];
  canEdit: boolean;
  onSaved: (h: WorkshopHours[]) => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<WorkshopHours[]>(hours);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function update(weekday: number, patch: Partial<WorkshopHours>) {
    setRows((list) =>
      list.map((r) => {
        if (r.weekday !== weekday) return r;
        const next = { ...r, ...patch };
        // Opening a day with no times starts it at the usual hours.
        if (patch.closed === false && (!next.opens || !next.closes)) return { ...next, opens: next.opens ?? '08:00', closes: next.closes ?? '17:00' };
        return next;
      }),
    );
    setSaved(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateHours(rows);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const next = await saveHours(workshopId, result.value);
      setRows(next);
      onSaved(next);
      setSaved('Opening hours saved.');
    } catch (err) {
      setErrors([errorMessage(err, 'The hours were not saved.')]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Card className="p-4 sm:p-5">
        <CardHeader title="Opening hours" subtitle="Customers can book within these hours" />
        <fieldset disabled={!canEdit}>
          <legend className="sr-only">Opening hours per weekday</legend>
          <ul className="divide-y divide-line">
            {WEEK_ORDER.map((wd) => {
              const r = rows.find((x) => x.weekday === wd)!;
              const name = WEEKDAY_NAMES[wd];
              const invalid = !r.closed && r.opens && r.closes && r.opens >= r.closes;
              return (
                <li key={wd} className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[7rem_7rem_1fr]">
                  <span className="text-xs font-semibold text-fg">{name}</span>
                  <label htmlFor={`${id}-closed-${wd}`} className="flex items-center gap-2 text-xs text-fg2 coarse:min-h-11">
                    <input
                      id={`${id}-closed-${wd}`}
                      type="checkbox"
                      checked={r.closed}
                      onChange={(e) => update(wd, { closed: e.target.checked })}
                      className="h-4 w-4 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
                    />
                    Closed
                  </label>
                  {r.closed ? (
                    <span className="col-span-2 text-[11px] text-fg3 sm:col-span-1">No bookings</span>
                  ) : (
                    <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                      <label htmlFor={`${id}-opens-${wd}`} className="sr-only">
                        {name} opens
                      </label>
                      <input
                        id={`${id}-opens-${wd}`}
                        type="time"
                        step={900}
                        value={r.opens ?? ''}
                        onChange={(e) => update(wd, { opens: e.target.value || null })}
                        aria-invalid={invalid || undefined}
                        className={`${inputClass} !w-32`}
                      />
                      <span className="text-[11px] text-fg3" aria-hidden>
                        to
                      </span>
                      <label htmlFor={`${id}-closes-${wd}`} className="sr-only">
                        {name} closes
                      </label>
                      <input
                        id={`${id}-closes-${wd}`}
                        type="time"
                        step={900}
                        value={r.closes ?? ''}
                        onChange={(e) => update(wd, { closes: e.target.value || null })}
                        aria-invalid={invalid || undefined}
                        className={`${inputClass} !w-32`}
                      />
                      {invalid && <span className="text-[11px] text-bad">Opens must be before closes.</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="mt-4 space-y-3">
          <ErrorNote errors={errors} />
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save opening hours'}
              </Button>
              <Saved text={saved} />
            </div>
          )}
        </div>
      </Card>
    </form>
  );
}

function ClosuresCard({
  workshopId,
  closures,
  tz,
  canEdit,
  onChange,
}: {
  workshopId: string;
  closures: Closure[];
  tz: string;
  canEdit: boolean;
  onChange: (c: Closure[]) => void;
}) {
  const id = useId();
  const [day, setDay] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const list = upcomingClosures(closures, tz);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    setBusy('add');
    try {
      const c = await addClosure(workshopId, day, reason);
      onChange([...closures, c]);
      setDay('');
      setReason('');
      setSaved(`Closed on ${formatDayKey(c.day, 'medium')}.`);
    } catch (err) {
      setError(errorMessage(err, 'The date was not added.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: Closure) {
    setError(null);
    setSaved(null);
    setBusy(c.id);
    try {
      await removeClosure(c.id);
      onChange(closures.filter((x) => x.id !== c.id));
      setSaved(`${formatDayKey(c.day, 'medium')} is open again.`);
    } catch (err) {
      setError(errorMessage(err, 'The date was not removed.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Closed dates" subtitle="Holidays and other days with no bookings" />
      {list.length === 0 ? (
        <p className="text-xs text-fg2">No upcoming closed dates.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line/70">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="font-semibold text-fg">{formatDayKey(c.day, 'long')}</span>
                {c.reason && <span className="block break-words text-fg2">{c.reason}</span>}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  disabled={busy !== null}
                  aria-label={`Remove closed date ${formatDayKey(c.day, 'long')}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-bad hover:bg-bad/10 disabled:opacity-50 coarse:h-11 coarse:w-11"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={(e) => void add(e)} noValidate className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Labeled id={`${id}-day`} label="Date">
            <input id={`${id}-day`} type="date" min={todayKey(tz)} value={day} onChange={(e) => setDay(e.target.value)} className={inputClass} />
          </Labeled>
          <Labeled id={`${id}-reason`} label="Reason (optional)">
            <input
              id={`${id}-reason`}
              value={reason}
              maxLength={80}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
              placeholder="Statutory holiday"
            />
          </Labeled>
          <Button type="submit" disabled={busy !== null || !day}>
            {busy === 'add' ? 'Adding...' : 'Add closed date'}
          </Button>
        </form>
      )}
      <div className="mt-3 space-y-2">
        <ErrorNote errors={error} />
        <Saved text={saved} />
      </div>
    </Card>
  );
}
