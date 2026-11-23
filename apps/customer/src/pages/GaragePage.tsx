import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, CalendarCheck, CalendarClock, CalendarX, Car, FileText, ImageOff, MessageSquare, Pencil, Plus, RotateCcw, Settings, Trash2, User, Wrench } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { cancelMyAppointment, formatZonedDateTime, listMyAppointments, useBookingSettings } from '@/api/booking';
import type { Appointment, AppointmentStatus } from '@/api/booking';
import { ACTIVE_STATUSES, listMyRepairs, vehicleName as repairVehicleName } from '@/api/repairs';
import type { MyRepair } from '@/api/repairs';
import { createVehicle, deleteVehicle, listVehicles, setVehiclePhoto, updateVehicle } from '@/api/vehicles';
import { customerPhotoUrl, removeCustomerPhoto, uploadCustomerPhoto } from '@/api/photos';
import type { VehicleInput } from '@/api/vehicles';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import type { CustomerAccount } from '@/auth/CustomerAuthContext';
import { Pill } from '@/components/ui';
import { sitePath, useSite } from '@/site/SiteContext';
import { AccountLoadError, NotificationsCard } from '@/pages/account/AccountPage';
import { VehicleForm } from '@/pages/garage/VehicleForm';
import { PhotoButton, ProfilePhotoEditor } from '@/components/PhotoPicker';
import { useCustomerAlerts } from '@/auth/CustomerAlerts';
import { AlertCount } from '@/components/layout/AccountMenu';
import { ProgressBar, StatusPill } from '@/pages/track/repairUi';

function vehicleName(v: Pick<CustomerVehicleRow, 'year' | 'make' | 'model'>): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

export function GaragePage() {
  const site = useSite();
  const { account, accountError, reload } = useCustomerAuth();

  useEffect(() => {
    document.title = `My Garage | ${site.display_name}`;
  }, [site.display_name]);

  if (!account) {
    return (
      <div className="container-site py-8 sm:py-12">
        <AccountLoadError message={accountError} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="container-site space-y-6 py-8 sm:space-y-8 sm:py-12">
      <Greeting />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 lg:col-span-2">
          <MyVehicles account={account} />
        </div>
        <div className="min-w-0 space-y-6">
          <Reminders account={account} />
        </div>
      </div>

      <RepairsInProgress account={account} />

      <MyAppointments account={account} />

      {/* Invoices: shown once invoices exist (none are issued yet). */}
    </div>
  );
}

function Greeting() {
  const site = useSite();
  const { displayName } = useCustomerAuth();
  const first = displayName.split(/\s+/)[0] ?? displayName;
  return (
    <section className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">My Garage</p>
          <h1 className="mt-2 break-words font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Welcome back, {first}</h1>
          <p className="mt-2 text-sm text-fg2">Your vehicles, visits and reminders at {site.display_name}.</p>
        </div>
        <ProfilePhotoEditor compact />
      </div>
    </section>
  );
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; vehicles: CustomerVehicleRow[] };

function MyVehicles({ account }: { account: CustomerAccount }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [formFor, setFormFor] = useState<'new' | CustomerVehicleRow | null>(null);
  const [announce, setAnnounce] = useState('');
  const addRef = useRef<HTMLButtonElement>(null);
  const formId = useId();

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const { data, error } = await listVehicles(account.id);
    setState(error !== null ? { status: 'error', message: error } : { status: 'ready', vehicles: data });
  }, [account.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function closeForm() {
    setFormFor(null);
    requestAnimationFrame(() => addRef.current?.focus());
  }

  async function save(input: VehicleInput): Promise<string | null> {
    if (state.status !== 'ready') return 'Your vehicles are still loading.';
    if (formFor === 'new') {
      const { data, error } = await createVehicle(account.id, input);
      if (error !== null) return error;
      setState({ status: 'ready', vehicles: [...state.vehicles, data] });
      setAnnounce(`${vehicleName(data)} added to your garage.`);
    } else if (formFor) {
      const { data, error } = await updateVehicle(formFor.id, input);
      if (error !== null) return error;
      setState({ status: 'ready', vehicles: state.vehicles.map((v) => (v.id === data.id ? data : v)) });
      setAnnounce(`${vehicleName(data)} saved.`);
    }
    closeForm();
    return null;
  }

  async function changePhoto(vehicle: CustomerVehicleRow, file: File | null): Promise<string | null> {
    let path: string | null = null;
    if (file) {
      const up = await uploadCustomerPhoto(account.id, file, 1600);
      if (up.error !== null) return up.error;
      path = up.data;
    }
    const { data, error } = await setVehiclePhoto(vehicle.id, path);
    if (error !== null) {
      void removeCustomerPhoto(path);
      return error;
    }
    void removeCustomerPhoto(vehicle.photo_path);
    setState((s) => (s.status === 'ready' ? { status: 'ready', vehicles: s.vehicles.map((v) => (v.id === data.id ? data : v)) } : s));
    setAnnounce(file ? `Photo of ${vehicleName(data)} saved.` : `Photo of ${vehicleName(data)} removed.`);
    return null;
  }

  async function remove(vehicle: CustomerVehicleRow): Promise<string | null> {
    const err = await deleteVehicle(vehicle.id);
    if (err) return err;
    void removeCustomerPhoto(vehicle.photo_path);
    setState((s) => (s.status === 'ready' ? { status: 'ready', vehicles: s.vehicles.filter((v) => v.id !== vehicle.id) } : s));
    setAnnounce(`${vehicleName(vehicle)} removed from your garage.`);
    if (formFor !== 'new' && formFor?.id === vehicle.id) setFormFor(null);
    requestAnimationFrame(() => addRef.current?.focus());
    return null;
  }

  return (
    <section aria-labelledby="my-vehicles">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-vehicles" className="font-display text-xl font-semibold text-fg">
          My Vehicles
        </h2>
        <button
          ref={addRef}
          type="button"
          onClick={() => setFormFor((f) => (f === 'new' ? null : 'new'))}
          aria-expanded={formFor === 'new'}
          aria-controls={formId}
          disabled={state.status !== 'ready'}
          className="btn-outline px-4 py-2 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add vehicle
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div id={formId}>
        {formFor && (
          <VehicleForm
            key={formFor === 'new' ? 'new' : formFor.id}
            initial={formFor === 'new' ? undefined : formFor}
            onSave={save}
            onCancel={closeForm}
          />
        )}
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true" className="mt-5">
          <p className="sr-only" role="status">
            Loading your vehicles
          </p>
          <ul className="grid gap-5 sm:grid-cols-2" aria-hidden>
            {[0, 1].map((i) => (
              <li key={i} className="glass h-40 animate-pulse rounded-2xl motion-reduce:animate-none" />
            ))}
          </ul>
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="glass mt-5 rounded-2xl border-l-4 border-l-bad p-5">
          <p className="font-semibold text-fg">We could not load your vehicles.</p>
          <p className="mt-1 text-sm text-fg2">{state.message}</p>
          <button type="button" onClick={() => void load()} className="btn-outline mt-4">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && state.vehicles.length === 0 && !formFor && (
        <div className="glass mt-5 flex flex-col items-center rounded-2xl p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Car className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-4 font-semibold text-fg">No vehicles yet</p>
          <p className="mt-1 max-w-sm text-sm text-fg2">Add your car so the workshop has its details ready when you book.</p>
          <button type="button" onClick={() => setFormFor('new')} className="btn-ink mt-5">
            <Plus className="h-4 w-4" aria-hidden />
            Add your first vehicle
          </button>
        </div>
      )}

      {state.status === 'ready' && state.vehicles.length > 0 && (
        <ul className="mt-5 grid gap-5 sm:grid-cols-2">
          {state.vehicles.map((v) => (
            <li key={v.id}>
              <VehicleCard
                vehicle={v}
                editing={formFor !== 'new' && formFor?.id === v.id}
                onEdit={() => {
                  setFormFor(v);
                  window.scrollTo({ top: (document.getElementById(formId)?.getBoundingClientRect().top ?? 0) + window.scrollY - 120, behavior: 'smooth' });
                }}
                onDelete={() => remove(v)}
                onPhoto={(file) => changePhoto(v, file)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VehicleCard({
  vehicle: v,
  editing,
  onEdit,
  onDelete,
  onPhoto,
}: {
  vehicle: CustomerVehicleRow;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => Promise<string | null>;
  /** A new photo, or null to remove it. */
  onPhoto: (file: File | null) => Promise<string | null>;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  useEffect(() => setPhotoBroken(false), [v.photo_path]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const name = vehicleName(v);
  const titleId = useId();

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    const err = await onDelete();
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  const smallBtn =
    'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface2 disabled:opacity-60 coarse:min-h-11';

  return (
    <article aria-labelledby={titleId} className={`glass flex h-full flex-col rounded-2xl p-5 ${editing ? 'ring-2 ring-accent/40' : ''}`}>
      {v.photo_path && !photoBroken && (
        <img
          src={customerPhotoUrl(v.photo_path)}
          alt={`Photo of ${v.nickname || name}`}
          loading="lazy"
          onError={() => setPhotoBroken(true)}
          className="-mx-1 -mt-1 mb-4 aspect-[16/9] w-[calc(100%+0.5rem)] rounded-xl bg-surface2 object-cover"
        />
      )}
      <div className="flex items-start gap-3">
        {!v.photo_path && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Car className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h3 id={titleId} className="break-words font-semibold text-fg">
            {v.nickname || name}
          </h3>
          {v.nickname && <p className="text-sm text-fg2">{name}</p>}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="min-w-0 rounded-xl bg-surface2/70 p-3">
          <dt className="text-fg3">Plate</dt>
          <dd className="mt-1 truncate font-mono font-semibold tracking-wider text-fg">{v.plate || 'Not set'}</dd>
        </div>
        <div className="min-w-0 rounded-xl bg-surface2/70 p-3">
          <dt className="text-fg3">VIN</dt>
          <dd className="mt-1 break-all font-mono font-semibold text-fg">{v.vin || 'Not set'}</dd>
        </div>
      </dl>

      <div className="mt-auto pt-4">
        {confirming ? (
          <div role="group" aria-label={`Delete ${name}?`} className="rounded-xl border border-bad/30 bg-bad/5 p-3">
            <p className="text-sm font-semibold text-fg">Delete this vehicle?</p>
            <p className="mt-0.5 text-xs text-fg2">It is removed from your garage. This cannot be undone.</p>
            {error && (
              <p role="alert" className="mt-2 text-xs font-medium text-bad">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bad px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60 coarse:min-h-11"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {busy ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                ref={cancelRef}
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                  requestAnimationFrame(() => deleteRef.current?.focus());
                }}
                disabled={busy}
                className={smallBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className={smallBtn} aria-label={`Edit ${name}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
            <PhotoButton
              label={v.photo_path ? 'Change photo' : 'Add photo'}
              ariaLabel={v.photo_path ? `Change photo of ${name}` : `Add a photo of ${name}`}
              onFile={(file) => onPhoto(file)}
            />
            {v.photo_path && (
              <button
                type="button"
                disabled={photoBusy}
                onClick={async () => {
                  setPhotoBusy(true);
                  setPhotoError(null);
                  const err = await onPhoto(null);
                  setPhotoBusy(false);
                  setPhotoError(err);
                }}
                className={smallBtn}
                aria-label={`Remove photo of ${name}`}
              >
                <ImageOff className="h-3.5 w-3.5" aria-hidden />
                {photoBusy ? 'Removing...' : 'Remove photo'}
              </button>
            )}
            <button ref={deleteRef} type="button" onClick={() => setConfirming(true)} className={smallBtn} aria-label={`Delete ${name}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
            {photoError && (
              <p role="alert" className="w-full text-xs font-medium text-bad">
                {photoError}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Reminders({ account }: { account: CustomerAccount }) {
  const site = useSite();
  return (
    <section aria-labelledby="reminders" className="glass rounded-2xl p-5">
      <h2 id="reminders" className="flex items-center gap-2 font-semibold text-fg">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Bell className="h-4 w-4" aria-hidden />
        </span>
        Reminders
      </h2>
      <p className="mt-3 text-sm text-fg2">Service reminders and repair updates from {site.display_name}. Remind me by:</p>
      <div className="mt-2">
        <NotificationsCard account={account} compact />
      </div>
      <Link
        to={sitePath(site, 'account')}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline coarse:min-h-11"
      >
        <Settings className="h-4 w-4" aria-hidden />
        Account settings
      </Link>
    </section>
  );
}

// Appointments ------------------------------------------------------------------------------

const STATUS: Record<AppointmentStatus, { label: string; tone: 'accent' | 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  requested: { label: 'Requested', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  checked_in: { label: 'Checked in', tone: 'accent' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  no_show: { label: 'Missed', tone: 'neutral' },
};

function isUpcoming(a: Appointment): boolean {
  return ['requested', 'confirmed', 'checked_in'].includes(a.status) && Date.parse(a.starts_at) + a.duration_minutes * 60_000 > Date.now();
}

type ApptState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; list: Appointment[] };

function MyAppointments({ account }: { account: CustomerAccount }) {
  const site = useSite();
  const setup = useBookingSettings();
  const [state, setState] = useState<ApptState>({ status: 'loading' });
  const [announce, setAnnounce] = useState('');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const { data, error } = await listMyAppointments(account.id, site.workshop_id);
    setState(error !== null ? { status: 'error', message: error } : { status: 'ready', list: data });
  }, [account.id, site.workshop_id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(a: Appointment, reason: string): Promise<string | null> {
    const err = await cancelMyAppointment(a.id, reason);
    if (err) return err;
    setState((s) =>
      s.status === 'ready' ? { status: 'ready', list: s.list.map((x) => (x.id === a.id ? { ...x, status: 'cancelled', cancel_reason: reason.trim() || null } : x)) } : s,
    );
    setAnnounce(`Booking ${a.reference} cancelled.`);
    return null;
  }

  const tz = setup.data?.settings.time_zone;
  const ready = state.status === 'ready' && tz;
  const upcoming = state.status === 'ready' ? state.list.filter(isUpcoming) : [];
  const past = state.status === 'ready' ? state.list.filter((a) => !isUpcoming(a)).reverse() : [];

  return (
    <section aria-labelledby="my-appointments">
      <h2 id="my-appointments" className="font-display text-xl font-semibold text-fg">
        My appointments
      </h2>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {(state.status === 'loading' || (state.status === 'ready' && setup.loading)) && (
        <div aria-busy="true" className="mt-5">
          <p className="sr-only" role="status">
            Loading your appointments
          </p>
          <ul className="grid gap-4 md:grid-cols-2" aria-hidden>
            {[0, 1].map((i) => (
              <li key={i} className="glass h-36 animate-pulse rounded-2xl motion-reduce:animate-none" />
            ))}
          </ul>
        </div>
      )}

      {(state.status === 'error' || (state.status === 'ready' && setup.error)) && (
        <div role="alert" className="glass mt-5 rounded-2xl border-l-4 border-l-bad p-5">
          <p className="font-semibold text-fg">We could not load your appointments.</p>
          <p className="mt-1 text-sm text-fg2">{state.status === 'error' ? state.message : 'Check your connection and try again.'}</p>
          <button
            type="button"
            onClick={() => {
              if (setup.error) setup.retry();
              void load();
            }}
            className="btn-outline mt-4"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

      {ready && state.list.length === 0 && (
        <div className="glass mt-5 flex flex-col items-center rounded-2xl p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <CalendarClock className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-4 font-semibold text-fg">No appointments yet</p>
          <p className="mt-1 max-w-sm text-sm text-fg2">Book a time online and it will appear here.</p>
          <Link to={sitePath(site, 'book')} className="btn-ink mt-5">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Book
          </Link>
        </div>
      )}

      {ready && state.list.length > 0 && (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg3">Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-sm text-fg2">
                Nothing booked right now.
                <Link to={sitePath(site, 'book')} className="btn-ink px-4 py-2">
                  <CalendarCheck className="h-4 w-4" aria-hidden />
                  Book
                </Link>
              </p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <AppointmentCard appointment={a} timeZone={tz} onCancel={(reason) => cancel(a, reason)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {past.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg3">Past</h3>
              <ul className="grid gap-4 md:grid-cols-2">
                {past.map((a) => (
                  <li key={a.id}>
                    <AppointmentCard appointment={a} timeZone={tz} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AppointmentCard({
  appointment: a,
  timeZone,
  onCancel,
}: {
  appointment: Appointment;
  timeZone: string;
  /** Present for upcoming requested or confirmed bookings. */
  onCancel?: (reason: string) => Promise<string | null>;
}) {
  const titleId = useId();
  const car = [a.vehicle.year, a.vehicle.make, a.vehicle.model].filter(Boolean).join(' ') || 'Vehicle not given';
  const services = a.services.map((s) => s.name).filter(Boolean);
  const st = STATUS[a.status] ?? STATUS.requested;
  const cancellable = !!onCancel && (a.status === 'requested' || a.status === 'confirmed');
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <article aria-labelledby={titleId} className="glass flex h-full flex-col rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 id={titleId} className="break-words font-semibold text-fg">
            {formatZonedDateTime(a.starts_at, timeZone)}
          </h4>
          <p className="mt-0.5 font-mono text-xs font-semibold tracking-wider text-fg2">{a.reference}</p>
        </div>
        <Pill tone={st.tone}>{st.label}</Pill>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="sr-only">Car</dt>
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <dd className="min-w-0 break-words text-fg">{car}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">Services</dt>
          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <dd className="min-w-0 break-words text-fg2">{services.length ? services.join(', ') : 'Problem described; quoted after inspection'}</dd>
        </div>
        {a.technician_name && (
          <div className="flex gap-2">
            <dt className="sr-only">Technician</dt>
            <User className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <dd className="min-w-0 break-words text-fg2">{a.technician_name}</dd>
          </div>
        )}
        {a.status === 'cancelled' && a.cancel_reason && (
          <div className="flex gap-2">
            <dt className="sr-only">Cancellation reason</dt>
            <CalendarX className="mt-0.5 h-4 w-4 shrink-0 text-fg3" aria-hidden />
            <dd className="min-w-0 break-words text-xs text-fg3">{a.cancel_reason}</dd>
          </div>
        )}
      </dl>
      {cancellable && onCancel && (
        <div className="mt-auto pt-4">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface2"
            aria-label={`Cancel booking ${a.reference}`}
          >
            <CalendarX className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </button>
          {open && (
            <CancelDialog
              appointment={a}
              when={formatZonedDateTime(a.starts_at, timeZone)}
              onConfirm={onCancel}
              onClose={() => {
                setOpen(false);
                requestAnimationFrame(() => cancelBtnRef.current?.focus());
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

/** Modal confirm (native dialog: focus is kept inside, Escape closes) with an optional reason. */
function CancelDialog({
  appointment: a,
  when,
  onConfirm,
  onClose,
}: {
  appointment: Appointment;
  when: string;
  onConfirm: (reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    keepRef.current?.focus();
  }, []);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm(reason);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="glass-strong w-[min(28rem,calc(100vw-2rem))] rounded-3xl bg-transparent p-0 text-fg backdrop:bg-ink/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-6">
        <h2 id={titleId} className="font-display text-lg font-semibold text-fg">
          Cancel this booking?
        </h2>
        <p className="mt-1 text-sm text-fg2">
          {a.reference}, {when}. The time is given back to the workshop.
        </p>
        <label htmlFor={reasonId} className="mt-4 block text-sm font-semibold text-fg">
          Reason <span className="text-xs font-normal text-fg3">Optional</span>
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-bad">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={keepRef} type="button" onClick={onClose} disabled={busy} className="btn-outline min-h-11 disabled:opacity-60">
            Keep booking
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            aria-disabled={busy || undefined}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-bad px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <CalendarX className="h-4 w-4" aria-hidden />
            {busy ? 'Cancelling...' : 'Yes, cancel booking'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

type RepairsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; list: MyRepair[] };

/** The customer's repairs at this workshop that are not finished yet, with progress and a link to each case. */
function RepairsInProgress({ account }: { account: CustomerAccount }) {
  const site = useSite();
  const [state, setState] = useState<RepairsState>({ status: 'loading' });

  const { alerts, forRepair } = useCustomerAlerts();

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState({ status: 'loading' });
      const { data, error } = await listMyRepairs(account.id, site.workshop_id);
      if (quiet && error !== null) return;
      setState(error !== null ? { status: 'error', message: error } : { status: 'ready', list: data.filter((r) => ACTIVE_STATUSES.includes(r.status)) });
    },
    [account.id, site.workshop_id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A new alert usually means the repair changed (sent for approval): refresh the cards quietly.
  const newestAlert = alerts[0]?.id;
  const firstAlert = useRef(true);
  useEffect(() => {
    if (firstAlert.current) {
      firstAlert.current = false;
      return;
    }
    if (newestAlert) void load(true);
  }, [newestAlert, load]);

  // Nothing in the workshop: keep the garage tidy.
  if (state.status === 'ready' && state.list.length === 0) return null;

  return (
    <section aria-labelledby="repairs-in-progress">
      <h2 id="repairs-in-progress" className="font-display text-xl font-semibold text-fg">
        Repairs in progress
      </h2>

      {state.status === 'loading' && (
        <div aria-busy="true" className="mt-5">
          <p className="sr-only" role="status">
            Loading your repairs
          </p>
          <div aria-hidden className="glass h-28 animate-pulse rounded-2xl motion-reduce:animate-none" />
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="glass mt-5 rounded-2xl border-l-4 border-l-bad p-5">
          <p className="font-semibold text-fg">We could not load your repairs.</p>
          <p className="mt-1 text-sm text-fg2">{state.message}</p>
          <button type="button" onClick={() => void load()} className="btn-outline mt-4">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {state.list.map((r) => {
            const name = repairVehicleName(r.vehicle);
            const unseen = forRepair(r.id);
            const needsApproval = r.status === 'awaiting_approval';
            const messagesHref = sitePath(site, `track/${encodeURIComponent(r.tracking_code)}#messages`);
            const latestMessage = unseen.find((a) => a.kind === 'message');
            return (
              <li key={r.id} className={`glass flex flex-col gap-4 rounded-2xl p-5 ${needsApproval || unseen.length ? 'ring-2 ring-red-500/40' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Wrench className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-fg">{name}</h3>
                      <p className="text-xs text-fg3">
                        {r.number}
                        <span aria-hidden> · </span>
                        <span className="font-mono">{r.tracking_code}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={messagesHref}
                      aria-label={
                        unseen.length
                          ? `${unseen.length} new notification${unseen.length === 1 ? '' : 's'} for ${name}. Open messages`
                          : `Messages for ${name}`
                      }
                      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition coarse:h-11 coarse:w-11 ${
                        unseen.length || needsApproval
                          ? 'border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                          : 'border-line bg-surface text-fg2 hover:bg-surface2 hover:text-fg'
                      }`}
                    >
                      <Bell className={`h-[18px] w-[18px] ${unseen.length ? 'origin-top motion-safe:animate-[wiggle_1.2s_ease-in-out_2]' : ''}`} aria-hidden />
                      <AlertCount count={unseen.length} className="absolute -right-1.5 -top-1.5" />
                    </Link>
                    <StatusPill status={r.status} />
                  </div>
                </div>
                {needsApproval && (
                  <Link
                    to={sitePath(site, `track/${encodeURIComponent(r.tracking_code)}`)}
                    className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 transition hover:bg-red-500/15"
                  >
                    <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
                      <BellRing className="h-4 w-4" aria-hidden />
                      <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-400 motion-safe:animate-ping" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">Your approval is needed</span>
                      <span className="block text-xs text-fg2">
                        {unseen.find((a) => a.kind === 'approval')?.body ?? 'The technician has diagnosed your car. Review the estimate and approve or decline the work.'}
                      </span>
                    </span>
                  </Link>
                )}
                {latestMessage && (
                  <Link to={messagesHref} className="flex items-start gap-3 rounded-xl border border-line bg-surface2/60 p-3 transition hover:bg-surface2">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-fg">New message from the workshop</span>
                      <span className="line-clamp-2 block break-words text-xs text-fg2">{latestMessage.body}</span>
                    </span>
                  </Link>
                )}
                <ProgressBar status={r.status} label={`Progress of ${name}`} />
                <Link
                  to={sitePath(site, `track/${encodeURIComponent(r.tracking_code)}`)}
                  aria-label={`Open repair ${r.number}, ${name}`}
                  className="btn-outline min-h-11 self-start py-2.5"
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  {r.status === 'awaiting_approval' ? 'Review estimate' : 'Open repair'}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
