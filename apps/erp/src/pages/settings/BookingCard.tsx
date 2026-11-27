import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarPlus, Trash2 } from 'lucide-react';
import {
  COMMON_TIME_ZONES,
  HALF_HOUR_TIMES,
  HOURS_STEP,
  SLOT_MINUTES,
  WEEKDAY_NAMES,
  addClosure,
  addClosures,
  errorMessage,
  formatClock,
  formatDayKey,
  getBookingContext,
  holidayChoices,
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
import { HOLIDAY_REGIONS, HOLIDAY_REGION_NAMES, isHolidayRegion } from '@/lib/holidays';
import type { HolidayRegion } from '@/lib/holidays';
import { CheckRow, Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';

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
        <p className="rounded-xl glass-field px-3 py-2 text-xs text-fg2">
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
        region={ctx.settings.holiday_region}
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
            <Labeled id={`${id}-rate`} label="Standard hourly labour rate (CAD)" hint="0 to 1000, up to two decimals, for example 145.00.">
              <input
                id={`${id}-rate`}
                inputMode="decimal"
                value={draft.labour_rate}
                onChange={(e) => set({ labour_rate: e.target.value })}
                onBlur={() => {
                  const n = Number(draft.labour_rate.trim().replace(/^\$\s*/, ''));
                  if (draft.labour_rate.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 && /^\$?\s*\d{1,4}(\.\d{0,2})?$/.test(draft.labour_rate.trim())) {
                    set({ labour_rate: n.toFixed(2) });
                  }
                }}
                className={inputClass}
                placeholder="0.00"
              />
            </Labeled>
            <Labeled id={`${id}-region`} label="Holiday region" hint="Which public holidays the calendar labels and the holiday picker offers.">
              <select
                id={`${id}-region`}
                value={draft.holiday_region}
                onChange={(e) => {
                  if (isHolidayRegion(e.target.value)) set({ holiday_region: e.target.value });
                }}
                className={inputClass}
              >
                {HOLIDAY_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {HOLIDAY_REGION_NAMES[r]}
                  </option>
                ))}
              </select>
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
        <CardHeader
          title="Opening hours"
          subtitle={`Customers and staff can book only within these hours, in ${HOURS_STEP}-minute steps from opening`}
        />
        <fieldset disabled={!canEdit}>
          <legend className="sr-only">Opening hours per weekday</legend>
          <ul className="divide-y divide-line">
            {WEEK_ORDER.map((wd) => {
              const r = rows.find((x) => x.weekday === wd)!;
              const name = WEEKDAY_NAMES[wd];
              const invalid = !r.closed && r.opens && r.closes && r.opens >= r.closes;
              const offGrid = !r.closed && [r.opens, r.closes].some((t) => t && !HALF_HOUR_TIMES.includes(t));
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
                      <HalfHourSelect
                        id={`${id}-opens-${wd}`}
                        value={r.opens}
                        invalid={Boolean(invalid || offGrid)}
                        onChange={(v) => update(wd, { opens: v })}
                      />
                      <span className="text-[11px] text-fg3" aria-hidden>
                        to
                      </span>
                      <label htmlFor={`${id}-closes-${wd}`} className="sr-only">
                        {name} closes
                      </label>
                      <HalfHourSelect
                        id={`${id}-closes-${wd}`}
                        value={r.closes}
                        invalid={Boolean(invalid || offGrid)}
                        onChange={(v) => update(wd, { closes: v })}
                      />
                      {invalid && <span className="text-[11px] text-bad">Opens must be before closes.</span>}
                      {offGrid && <span className="text-[11px] text-bad">Use the hour or half hour.</span>}
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

/** An opening or closing time on the hour or half hour. An older off-grid value stays visible so it can be fixed. */
function HalfHourSelect({ id, value, invalid, onChange }: { id: string; value: string | null; invalid: boolean; onChange: (v: string | null) => void }) {
  const offGrid = value !== null && !HALF_HOUR_TIMES.includes(value);
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-invalid={invalid || undefined}
      className={`${inputClass} !w-32`}
    >
      {value === null && <option value="">Choose</option>}
      {offGrid && <option value={value}>{formatClock(value)} (change it)</option>}
      {HALF_HOUR_TIMES.map((t) => (
        <option key={t} value={t}>
          {formatClock(t)}
        </option>
      ))}
    </select>
  );
}

function ClosuresCard({
  workshopId,
  closures,
  tz,
  region,
  canEdit,
  onChange,
}: {
  workshopId: string;
  closures: Closure[];
  tz: string;
  region: HolidayRegion;
  canEdit: boolean;
  onChange: (c: Closure[]) => void;
}) {
  const id = useId();
  const [day, setDay] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
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
      {canEdit && (
        <div className="mt-3">
          <Button variant="ghost" onClick={() => setPicking(true)} disabled={busy !== null} aria-haspopup="dialog">
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Add Canadian holidays
          </Button>
        </div>
      )}
      {picking && (
        <HolidayDialog
          workshopId={workshopId}
          closures={closures}
          tz={tz}
          region={region}
          onClose={() => setPicking(false)}
          onAdded={(added) => {
            onChange([...closures, ...added]);
            setPicking(false);
            setError(null);
            setSaved(
              added.length === 0
                ? 'No new dates added. They were already closed.'
                : `${added.length} ${added.length === 1 ? 'holiday' : 'holidays'} added to the closed dates.`,
            );
          }}
        />
      )}
      <div className="mt-3 space-y-2">
        <ErrorNote errors={error} />
        <Saved text={saved} />
      </div>
    </Card>
  );
}

/**
 * Picks Canadian public holidays to add as closed dates. Statutory ones are
 * ticked to start with; dates already closed or in the past cannot be ticked.
 */
function HolidayDialog({
  workshopId,
  closures,
  tz,
  region: savedRegion,
  onClose,
  onAdded,
}: {
  workshopId: string;
  closures: Closure[];
  tz: string;
  region: HolidayRegion;
  onClose: () => void;
  onAdded: (added: Closure[]) => void;
}) {
  const id = useId();
  const today = todayKey(tz);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [region, setRegion] = useState<HolidayRegion>(savedRegion);
  const choices = useMemo(() => holidayChoices(year, region, closures), [year, region, closures]);
  const defaults = useCallback(
    (list: typeof choices) => new Set(list.filter((h) => h.statutory && !h.added && h.date >= today).map((h) => h.date)),
    [today],
  );
  const [picked, setPicked] = useState<Set<string>>(() => defaults(choices));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different year or region starts again from its statutory holidays.
  useEffect(() => {
    setPicked(defaults(choices));
  }, [choices, defaults]);

  function toggle(date: string, on: boolean) {
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(date);
      else next.delete(date);
      return next;
    });
  }

  async function add() {
    setError(null);
    setSaving(true);
    try {
      const items = choices.filter((h) => picked.has(h.date) && !h.added).map((h) => ({ day: h.date, reason: h.name }));
      onAdded(await addClosures(workshopId, items, closures));
    } catch (err) {
      setError(errorMessage(err, 'The holidays were not added.'));
    } finally {
      setSaving(false);
    }
  }

  const count = choices.filter((h) => picked.has(h.date) && !h.added).length;

  return (
    <Dialog
      open
      size="sm"
      title="Add Canadian holidays"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void add()} disabled={saving || count === 0}>
            {saving ? 'Adding...' : `Add selected (${count})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Labeled id={`${id}-year`} label="Year">
            <select id={`${id}-year`} value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
              {[thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={`${id}-region`} label="Region">
            <select
              id={`${id}-region`}
              value={region}
              onChange={(e) => {
                if (isHolidayRegion(e.target.value)) setRegion(e.target.value);
              }}
              className={inputClass}
            >
              {HOLIDAY_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {HOLIDAY_REGION_NAMES[r]}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        <fieldset>
          <legend className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg3">
            Holidays in {HOLIDAY_REGION_NAMES[region]}, {year}
          </legend>
          <ul className="divide-y divide-line rounded-lg border border-line/70">
            {choices.map((h) => {
              const checkId = `${id}-h-${h.date}`;
              const past = h.date < today;
              const locked = h.added || past;
              return (
                <li key={h.date} className="flex items-center gap-3 px-3 py-2 coarse:min-h-11">
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={h.added || picked.has(h.date)}
                    disabled={locked || saving}
                    onChange={(e) => toggle(h.date, e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
                  />
                  <label htmlFor={checkId} className={`flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 ${locked ? 'text-fg3' : 'text-fg'}`}>
                    <span className="min-w-0 break-words">
                      <span className="font-semibold">{h.name}</span>
                      <span className="block text-[11px] text-fg2">{formatDayKey(h.date, 'long')}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-fg3">
                      {h.added ? 'Added' : past ? 'Past' : h.statutory ? 'Statutory' : 'Not statutory'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <p className="text-[11px] text-fg3">
          A convenience list. Rules differ by province and employer, so check your province's official list of statutory holidays.
        </p>
        <ErrorNote errors={error} />
      </div>
    </Dialog>
  );
}
