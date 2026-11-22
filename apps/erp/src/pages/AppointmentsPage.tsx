import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, CalendarClock, CalendarX, ChevronLeft, ChevronRight, Plus, UserCheck } from 'lucide-react';
import type { ServiceRow } from '@eurowerken/shared';
import {
  APPOINTMENT_STATUSES,
  bookableSlots,
  countByStatus,
  dayInfo,
  dayKeyOf,
  errorMessage,
  formatDayKey,
  formatRange,
  formatTimeRange,
  servicesLabel,
  vehicleLabel,
  getAppointment,
  getBookingContext,
  getSiteSlug,
  groupByDay,
  listAppointments,
  listAwaitingConfirmation,
  listTechnicians,
  matchesSearch,
  shiftAnchor,
  todayKey,
  visibleDays,
  visibleWindow,
} from '@/api/appointments';
import type { Appointment, AppointmentStatus, BookingContext, CalendarView, SiteSlug, Technician } from '@/api/appointments';
import { listServices } from '@/api/catalogue';
import { useAuth } from '@/auth/AuthContext';
import { useNotifications } from '@/notifications/NotificationsContext';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { SearchInput } from '@/components/ui/SearchInput';
import { APPOINTMENT_STATUS_LABEL } from '@/lib/status';
import { ErrorNote } from './inventory/PartForm';
import { AgendaList, DayTimeline, WeekGrid } from './appointments/CalendarViews';
import { AppointmentDialog } from './appointments/AppointmentDialog';
import { NewAppointmentDialog } from './appointments/NewAppointmentDialog';

type Filter = 'all' | AppointmentStatus;
const FILTERS: Filter[] = ['all', ...APPOINTMENT_STATUSES];

const segment =
  'rounded-md px-3 py-1.5 text-xs transition coarse:min-h-11 coarse:px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** Bookings: a day timeline or a week grid (an agenda list on phones), with a detail dialog per booking. */
export function AppointmentsPage() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const userId = user?.id ?? '';
  const canEdit = can('repair-orders', 'full');

  const [ctx, setCtx] = useState<BookingContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [site, setSite] = useState<SiteSlug | null>(null);

  // Week first: upcoming bookings are visible straight away (a single day is often empty or closed).
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { appointmentsVersion, appointmentOpened } = useNotifications();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  /** Set when the form was opened from an empty calendar slot. */
  const [createAt, setCreateAt] = useState<{ day: string; time: string } | null>(null);
  const [live, setLive] = useState('');
  const [now, setNow] = useState(() => new Date());

  const tz = ctx?.settings.time_zone ?? 'America/Edmonton';

  // Settings, hours and closures first: the time zone decides what "today" is.
  const loadContext = useCallback(async () => {
    if (!workshopId) return;
    setCtxError(null);
    try {
      const next = await getBookingContext(workshopId);
      setCtx(next);
      setAnchor((a) => a ?? todayKey(next.settings.time_zone));
    } catch (err) {
      setCtxError(errorMessage(err, 'The booking settings could not be loaded.'));
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  // Helpers for the dialogs; a failure here only hides suggestions or pickers.
  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void listTechnicians(workshopId).then((t) => active && setTechnicians(t)).catch(() => undefined);
    void listServices(workshopId).then((s) => active && setServices(s)).catch(() => undefined);
    void getSiteSlug(workshopId).then((s) => active && setSite(s));
    return () => {
      active = false;
    };
  }, [workshopId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const days = useMemo(() => (anchor ? visibleDays(view, anchor) : []), [view, anchor]);

  const request = useRef(0);
  const loadAppointments = useCallback(async () => {
    if (!workshopId || !ctx || days.length === 0) return;
    const mine = ++request.current;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listAppointments(workshopId, { from: days[0], to: days[days.length - 1] }, ctx.settings.time_zone);
      if (mine === request.current) setAppts(list);
    } catch (err) {
      if (mine === request.current) setLoadError(errorMessage(err, 'Appointments could not be loaded.'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [workshopId, ctx, days]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  // Bookings waiting to be confirmed, on any day (the Requested count and the list above the calendar).
  const [awaiting, setAwaiting] = useState<Appointment[]>([]);
  const loadAwaiting = useCallback(async () => {
    if (!workshopId) return;
    try {
      setAwaiting(await listAwaitingConfirmation(workshopId));
    } catch {
      // The calendar shows its own load errors; this list just stays as it was.
    }
  }, [workshopId]);
  useEffect(() => {
    void loadAwaiting();
  }, [loadAwaiting, appointmentsVersion]);

  // Real time: a booking was created or changed anywhere in the workshop, so reload the visible days.
  const firstVersion = useRef(appointmentsVersion);
  useEffect(() => {
    if (appointmentsVersion !== firstVersion.current) void loadAppointments();
  }, [appointmentsVersion, loadAppointments]);

  const visible = useMemo(
    () => appts.filter((a) => (filter === 'all' || a.status === filter) && matchesSearch(a, search)),
    [appts, filter, search],
  );
  const counts = useMemo(() => countByStatus(appts), [appts]);
  const byDay = useMemo(() => groupByDay(visible, tz), [visible, tz]);
  const infos = useMemo(() => (ctx ? days.map((d) => dayInfo(d, ctx)) : []), [days, ctx]);
  const timeWindow = useMemo(() => visibleWindow(infos, ctx?.hours ?? [], visible, tz), [infos, ctx, visible, tz]);
  // Empty slots inside opening hours that a click books from (staff who can book only).
  const slots = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!ctx || !canEdit) return map;
    for (const d of days) map.set(d, bookableSlots(d, ctx, now));
    return map;
  }, [ctx, canEdit, days, now]);
  const today = todayKey(tz);
  const selected = appts.find((a) => a.id === selectedId) ?? null;

  const open = useCallback(
    (a: Appointment) => {
      setSelectedId(a.id);
      appointmentOpened(a.id);
      // Refresh in the background so the dialog shows the latest state.
      void getAppointment(a.id)
        .then((fresh) => {
          if (fresh) setAppts((list) => list.map((x) => (x.id === fresh.id ? fresh : x)));
        })
        .catch(() => undefined);
    },
    [appointmentOpened],
  );

  // /appointments?open=<id> (from a notification): jump to that booking's day and open it.
  const openParam = params.get('open');
  useEffect(() => {
    if (!openParam || !ctx) return;
    let cancelled = false;
    void getAppointment(openParam)
      .then((a) => {
        if (cancelled || !a) return;
        setView('day');
        setAnchor(dayKeyOf(a.starts_at, ctx.settings.time_zone));
        setAppts((list) => (list.some((x) => x.id === a.id) ? list : [...list, a]));
        setSelectedId(a.id);
        appointmentOpened(a.id);
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(params);
        next.delete('open');
        setParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [openParam, ctx, params, setParams, appointmentOpened]);

  function onChanged(updated: Appointment) {
    // A booking moved out of the visible days stays in the list until the next load, so its dialog stays open.
    setAppts((list) => list.map((x) => (x.id === updated.id ? updated : x)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
  }

  function onCreated(a: Appointment) {
    setCreating(false);
    setLive(`Booking ${a.reference} created for ${formatDayKey(dayKeyOf(a.starts_at, tz), 'medium')}, ${formatTimeRange(a, tz)}.`);
    const day = dayKeyOf(a.starts_at, tz);
    if (days.includes(day)) setAppts((list) => [...list, a].sort((x, y) => x.starts_at.localeCompare(y.starts_at)));
    else setAnchor(day);
  }

  if (ctxError) {
    return (
      <Card className="space-y-3 p-4">
        <ErrorNote errors={`Bookings could not be loaded. ${ctxError}`} />
        <Button variant="ghost" onClick={() => void loadContext()}>
          Retry
        </Button>
      </Card>
    );
  }

  if (!ctx || !anchor || !workshopId) {
    return (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading appointments...
      </p>
    );
  }

  const filtered = filter !== 'all' || search.trim() !== '';
  let body;
  if (loadError) {
    body = (
      <div className="space-y-3 p-4">
        <ErrorNote errors={`Appointments could not be loaded. ${loadError}`} />
        <Button variant="ghost" onClick={() => void loadAppointments()}>
          Retry
        </Button>
      </div>
    );
  } else {
    const gridProps = {
      days: infos,
      byDay,
      window: timeWindow,
      today,
      now,
      tz,
      onOpen: open,
      slots,
      slotMinutes: ctx.settings.slot_minutes,
      onSlot: canEdit
        ? (day: string, time: string) => {
            setCreateAt({ day, time });
            setCreating(true);
          }
        : undefined,
    };
    body = (
      <>
        {loading && (
          <p role="status" className="border-b border-line px-4 py-2 text-[11px] text-fg2">
            Loading appointments...
          </p>
        )}
        {!loading && visible.length === 0 && (
          <p className="border-b border-line px-4 py-2.5 text-[11px] text-fg2">
            {filtered
              ? 'No appointments match the filter.'
              : view === 'day'
                ? 'No appointments on this day.'
                : 'No appointments in these 7 days.'}
            {!filtered && canEdit && ' Use New appointment, or click an open time in the calendar, to add one.'}
          </p>
        )}
        <div className="md:hidden">
          <AgendaList days={infos} byDay={byDay} today={today} tz={tz} onOpen={open} />
        </div>
        <div className="hidden md:block">{view === 'day' ? <DayTimeline {...gridProps} /> : <WeekGrid {...gridProps} />}</div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Calendar view" className="flex rounded-lg border border-line bg-surface/70 p-0.5">
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`${segment} ${view === v ? 'bg-accent font-semibold text-white' : 'text-fg2 hover:text-fg'}`}
            >
              {v === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" aria-label={view === 'day' ? 'Previous day' : 'Previous week'} onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="ghost" onClick={() => setAnchor(today)} disabled={days.includes(today) && (view === 'week' || anchor === today)}>
            Today
          </Button>
          <Button variant="ghost" aria-label={view === 'day' ? 'Next day' : 'Next week'} onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 basis-full font-display text-sm font-semibold text-fg sm:basis-auto" aria-live="polite">
          {formatRange(days)}
        </h2>
        {canEdit && (
          <Button
            onClick={() => {
              setCreateAt(null);
              setCreating(true);
            }}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New appointment
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard icon={CalendarClock} label="Requested" value={String(awaiting.length)} caption="upcoming, need confirming" />
        <KpiCard icon={CalendarCheck} label="Confirmed" value={String(counts.confirmed)} caption={view === 'day' ? 'on this day' : 'these 7 days'} />
        <KpiCard icon={UserCheck} label="Checked in" value={String(counts.checked_in)} caption="in the workshop" />
        <KpiCard icon={CalendarX} label="Cancelled" value={String(counts.cancelled)} caption={view === 'day' ? 'on this day' : 'these 7 days'} />
      </div>

      {awaiting.length > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-fg">
              Needs confirming <span className="ml-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">{awaiting.length}</span>
            </h2>
            <p className="text-[11px] text-fg3">Online requests on any upcoming day</p>
          </div>
          <ul className="divide-y divide-line/60">
            {awaiting.slice(0, 6).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-40 shrink-0 text-xs font-semibold text-fg">
                  {formatDayKey(dayKeyOf(a.starts_at, tz), 'medium')}, {formatTimeRange(a, tz)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-fg2">
                  {a.contact_name} · {vehicleLabel(a.vehicle) || 'Car not given'} · {servicesLabel(a) || 'Described problem'}
                </span>
                <Button size="sm" variant="ghost" onClick={() => {
                  setView('day');
                  setAnchor(dayKeyOf(a.starts_at, tz));
                  setAppts((list) => (list.some((x) => x.id === a.id) ? list : [...list, a]));
                  open(a);
                }}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
          {awaiting.length > 6 && <p className="mt-2 text-[11px] text-fg3">And {awaiting.length - 6} more. Use the Requested filter in Week view.</p>}
        </Card>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = f === filter;
            const count = f === 'all' ? appts.length : counts[f];
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition coarse:min-h-11 ${
                  active ? 'bg-accent font-semibold text-white' : 'border border-line bg-surface/70 text-fg2 hover:text-fg'
                }`}
              >
                {f === 'all' ? 'All' : APPOINTMENT_STATUS_LABEL[f]}
                <span className={`ml-1.5 text-[10px] ${active ? 'text-white/80' : 'text-fg3'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, reference, plate or phone" className="w-full lg:w-72" />
      </div>

      <Card className="overflow-hidden">{body}</Card>

      <p className="text-[11px] text-fg3">Times are in the workshop's time zone ({tz}).</p>

      <AppointmentDialog
        appt={selected}
        workshopId={workshopId}
        ctx={ctx}
        site={site}
        technicians={technicians}
        canEdit={canEdit}
        onChanged={onChanged}
        announce={setLive}
        onClose={() => setSelectedId(null)}
      />

      {canEdit && (
        <NewAppointmentDialog
          open={creating}
          workshopId={workshopId}
          userId={userId}
          ctx={ctx}
          site={site}
          services={services}
          technicians={technicians}
          day={createAt?.day ?? (anchor < today ? today : anchor)}
          time={createAt?.time}
          onClose={() => setCreating(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}
