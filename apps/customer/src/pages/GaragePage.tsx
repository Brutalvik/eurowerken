import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bell, CalendarCheck, Car, FileText, History, Pencil, Plus, RotateCcw, ScanLine, Settings, Trash2 } from 'lucide-react';
import type { CustomerVehicleRow } from '@eurowerken/shared';
import { createVehicle, deleteVehicle, listVehicles, updateVehicle } from '@/api/vehicles';
import type { VehicleInput } from '@/api/vehicles';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import type { CustomerAccount } from '@/auth/CustomerAuthContext';
import { sitePath, useSite } from '@/site/SiteContext';
import { AccountLoadError, NotificationsCard } from '@/pages/account/AccountPage';
import { VehicleForm } from '@/pages/garage/VehicleForm';

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

      <div className="grid gap-6 md:grid-cols-2">
        <EmptySection
          id="service-history"
          icon={History}
          title="Service history"
          text="No visits yet. Your bookings and repairs will appear here."
        />
        <EmptySection id="invoices" icon={FileText} title="Invoices" text="No invoices yet. Invoices from your visits will appear here." />
      </div>
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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to={sitePath(site, 'book')} className="btn-ink">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Book Appointment
          </Link>
          <Link to={sitePath(site, 'track')} className="btn-outline">
            <ScanLine className="h-4 w-4" aria-hidden />
            Track a repair
          </Link>
        </div>
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

  async function remove(vehicle: CustomerVehicleRow): Promise<string | null> {
    const err = await deleteVehicle(vehicle.id);
    if (err) return err;
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
}: {
  vehicle: CustomerVehicleRow;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => Promise<string | null>;
}) {
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
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Car className="h-5 w-5" aria-hidden />
        </span>
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
            <button ref={deleteRef} type="button" onClick={() => setConfirming(true)} className={smallBtn} aria-label={`Delete ${name}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
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

function EmptySection({ id, icon: Icon, title, text }: { id: string; icon: LucideIcon; title: string; text: ReactNode }) {
  const site = useSite();
  return (
    <section aria-labelledby={id} className="glass flex flex-col rounded-2xl p-5 sm:p-6">
      <h2 id={id} className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {title}
      </h2>
      <p className="mt-4 text-sm text-fg2">{text}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link to={sitePath(site, 'book')} className="btn-ink">
          <CalendarCheck className="h-4 w-4" aria-hidden />
          Book
        </Link>
        <Link to={sitePath(site, 'track')} className="btn-outline">
          <ScanLine className="h-4 w-4" aria-hidden />
          Track
        </Link>
      </div>
    </section>
  );
}
