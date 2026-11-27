import { useEffect, useId, useRef, useState } from 'react';
import { Car, ListChecks } from 'lucide-react';
import type { FormEvent } from 'react';
import type { ServiceRow } from '@eurowerken/shared';
import {
  createStaffBooking,
  errorMessage,
  firstStartTime,
  newBookingDraft,
  startTimeProblem,
  suggestedDuration,
  validateStaffBooking,
} from '@/api/appointments';
import { knownCarLabel } from '@/api/appointments';
import type { Appointment, BookingContext, KnownCar, KnownCustomer, SiteSlug, StaffBookingDraft, Technician } from '@/api/appointments';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { TimeFields } from './TimeFields';
import { CarPicker, LookupNote, carKey, useCustomerLookup } from './CustomerLookup';

interface NewAppointmentDialogProps {
  open: boolean;
  workshopId: string;
  userId: string;
  ctx: BookingContext;
  site: SiteSlug | null;
  services: ServiceRow[];
  technicians: Technician[];
  /** The day the form starts on (the day shown in the calendar). */
  day: string;
  /** A start time to begin with ('HH:MM', from clicking an empty slot); otherwise the day's first valid time. */
  time?: string;
  onClose: () => void;
  onCreated: (appt: Appointment) => void;
}

export function NewAppointmentDialog(props: NewAppointmentDialogProps) {
  // Remount on each open so the form starts empty.
  if (!props.open) return null;
  return <BookingForm {...props} />;
}

function BookingForm({ workshopId, userId, ctx, site, services, technicians, day, time, onClose, onCreated }: NewAppointmentDialogProps) {
  const id = useId();
  const formId = `${id}-form`;
  const [draft, setDraft] = useState<StaffBookingDraft>(() => {
    const d = newBookingDraft(day, ctx.settings.slot_minutes);
    return { ...d, time: time || firstStartTime(day, ctx, Number(d.duration)) || d.time };
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const active = services.filter((s) => s.active);
  const set = (patch: Partial<StaffBookingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // Customer lookup: typing an email or phone fills in the rest, and offers the customer's cars.
  const lookup = useCustomerLookup(draft.contact_email, draft.contact_phone);
  /** The last customer found; kept while a follow-up lookup for the same person runs. */
  const [known, setKnown] = useState<KnownCustomer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The car from file now in the form, and whether staff changed it since. */
  const [carFrom, setCarFrom] = useState<{ key: string; label: string; edited: boolean } | null>(null);
  const handled = useRef<{ ident: string; cars: number } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const carFromRef = useRef(carFrom);
  carFromRef.current = carFrom;
  const makeRef = useRef<HTMLInputElement>(null);

  function applyCar(car: KnownCar) {
    set({ make: car.make ?? '', model: car.model ?? '', year: car.year ?? '', plate: (car.plate ?? '').toUpperCase(), vin: car.vin ?? '', vehicle_id: car.vehicle_id });
    setCarFrom({ key: carKey(car), label: knownCarLabel(car), edited: false });
    setPickerOpen(false);
  }

  function newCar() {
    set({ make: '', model: '', year: '', plate: '', vin: '', vehicle_id: null });
    setCarFrom(null);
    setPickerOpen(false);
    // After the pop-up has closed and given focus back, move it to Make.
    window.setTimeout(() => makeRef.current?.focus(), 60);
  }

  /** A car field typed by hand: the details no longer match the car on file. */
  function setCar(patch: Partial<StaffBookingDraft>) {
    set({ ...patch, vehicle_id: null, ...(patch.plate !== undefined || patch.make !== undefined || patch.model !== undefined ? { vin: '' } : {}) });
    setCarFrom((c) => (c ? { ...c, edited: true } : c));
  }

  useEffect(() => {
    if (lookup.status === 'idle' || lookup.status === 'none') {
      handled.current = null;
      setKnown(null);
      setPickerOpen(false);
      setDraft((d) => (d.customer_id || d.vehicle_id ? { ...d, customer_id: null, vehicle_id: null } : d));
      return;
    }
    if (lookup.status !== 'found') return;
    const c = lookup.customer;
    setKnown(c);
    // Once per customer: filling in the email or phone starts another lookup for the same person.
    const ident = c.customer_id ?? `${c.email ?? ''}|${c.name ?? ''}`;
    const before = handled.current;
    handled.current = { ident, cars: c.vehicles.length };
    if (before && before.ident === ident) {
      // The same person, found again with more cars (the other field matched more visits): offer the choice,
      // unless staff already changed the car by hand.
      if (c.vehicles.length > before.cars && c.vehicles.length > 1 && !carFromRef.current?.edited) setPickerOpen(true);
      return;
    }
    const cur = draftRef.current;
    const carEmpty = !cur.make.trim() && !cur.model.trim() && !cur.plate.trim() && !cur.year.trim();
    setDraft((d) => {
      return {
        ...d,
        contact_name: d.contact_name.trim() ? d.contact_name : (c.name ?? ''),
        contact_email: d.contact_email.trim() ? d.contact_email : (c.email ?? ''),
        contact_phone: d.contact_phone.trim() ? d.contact_phone : (c.phone ?? ''),
        customer_id: c.customer_id,
      };
    });
    if (c.vehicles.length === 1 && carEmpty) applyCar(c.vehicles[0]);
    else if (c.vehicles.length > 1) setPickerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  function toggleService(serviceId: string, on: boolean) {
    setDraft((d) => {
      const ids = on ? [...d.service_ids, serviceId] : d.service_ids.filter((x) => x !== serviceId);
      const duration = d.durationEdited ? d.duration : String(Math.max(30, suggestedDuration(ids.length, ctx.settings.slot_minutes)));
      // A longer booking may no longer fit before closing: move to the first time that does.
      const fits = startTimeProblem(d.day, d.time, Number(duration), ctx) === null;
      const time = fits ? d.time : firstStartTime(d.day, ctx, Number(duration)) || d.time;
      return { ...d, service_ids: ids, duration, time };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateStaffBooking(draft, services, ctx.settings.time_zone, ctx);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const appt = await createStaffBooking(workshopId, userId, result.value);
      onCreated(appt);
    } catch (err) {
      setErrors([errorMessage(err, 'The booking could not be saved.')]);
    } finally {
      setSaving(false);
    }
  }

  const total = active.filter((s) => draft.service_ids.includes(s.id)).reduce((sum, s) => sum + s.price_from, 0);

  return (
    <Dialog
      open
      title="New appointment"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? 'Saving...' : warnings.length > 0 ? 'Book anyway' : 'Book appointment'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-5 text-xs">
        <ErrorNote errors={errors} />

        <fieldset className="space-y-3">
          <legend className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg3">Contact</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled id={`${id}-name`} label="Name">
              <input id={`${id}-name`} value={draft.contact_name} maxLength={120} autoComplete="off" onChange={(e) => set({ contact_name: e.target.value })} className={inputClass} required />
            </Labeled>
            <Labeled id={`${id}-email`} label="Email" hint="The confirmation goes here.">
              <input id={`${id}-email`} type="email" value={draft.contact_email} autoComplete="off" onChange={(e) => set({ contact_email: e.target.value })} className={inputClass} required />
            </Labeled>
            <Labeled id={`${id}-phone`} label="Phone (optional)">
              <input id={`${id}-phone`} type="tel" value={draft.contact_phone} maxLength={40} autoComplete="off" onChange={(e) => set({ contact_phone: e.target.value })} className={inputClass} />
            </Labeled>
          </div>
          <LookupNote state={lookup} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg3">Car</legend>
          {known && known.vehicles.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface2 px-3 py-2">
              <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-fg2">
                <Car className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                {carFrom ? (
                  <span>
                    {carFrom.edited ? 'Changed by hand from ' : 'Filled from file: '}
                    <strong className="text-fg">{carFrom.label}</strong>
                    {carFrom.edited ? '' : '. You can still change any detail.'}
                  </span>
                ) : (
                  <span>
                    {known.vehicles.length} {known.vehicles.length === 1 ? 'car' : 'cars'} on file for this customer.
                  </span>
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                {known.vehicles.length === 1 && !carFrom ? 'Use the car on file' : 'Choose a car'}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Labeled id={`${id}-make`} label="Make">
              <input ref={makeRef} id={`${id}-make`} value={draft.make} maxLength={40} onChange={(e) => setCar({ make: e.target.value })} className={inputClass} placeholder="BMW" />
            </Labeled>
            <Labeled id={`${id}-model`} label="Model">
              <input id={`${id}-model`} value={draft.model} maxLength={60} onChange={(e) => setCar({ model: e.target.value })} className={inputClass} placeholder="330i" />
            </Labeled>
            <Labeled id={`${id}-year`} label="Year">
              <input id={`${id}-year`} inputMode="numeric" value={draft.year} maxLength={4} onChange={(e) => setCar({ year: e.target.value })} className={inputClass} />
            </Labeled>
            <Labeled id={`${id}-plate`} label="Plate">
              <input id={`${id}-plate`} value={draft.plate} maxLength={20} onChange={(e) => setCar({ plate: e.target.value.toUpperCase() })} className={inputClass} />
            </Labeled>
          </div>
          {draft.vin && <p className="text-[11px] text-fg3">VIN {draft.vin} (from file)</p>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg3">Services</legend>
          {active.length === 0 ? (
            <p className="text-fg2">No active services. Describe the work in the notes, or add services in Settings, Services.</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {active.map((s) => {
                const checkId = `${id}-svc-${s.id}`;
                return (
                  <li key={s.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface2 px-3 py-2 coarse:min-h-11">
                    <input
                      id={checkId}
                      type="checkbox"
                      checked={draft.service_ids.includes(s.id)}
                      onChange={(e) => toggleService(s.id, e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
                    />
                    <label htmlFor={checkId} className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-fg">{s.name}</span>
                      {s.price_from > 0 && <span className="shrink-0 text-[11px] text-fg3">from {formatCurrency(s.price_from)}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {total > 0 && (
            <p className="text-[11px] text-fg2">
              Estimate {formatCurrency(total)} to {formatCurrency(Math.round(total * 150) / 100)}, as online bookings show it.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg3">When</legend>
          <TimeFields
            workshopId={workshopId}
            ctx={ctx}
            site={site}
            excludeId={null}
            day={draft.day}
            time={draft.time}
            duration={draft.duration}
            onWarnings={setWarnings}
            onChange={(p) => set(p)}
          />
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled id={`${id}-tech`} label="Technician">
            <select id={`${id}-tech`} value={draft.technician_id} onChange={(e) => set({ technician_id: e.target.value })} className={inputClass}>
              <option value="">Not assigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={`${id}-status`} label="Status">
            <select
              id={`${id}-status`}
              value={draft.status}
              onChange={(e) => set({ status: e.target.value === 'requested' ? 'requested' : 'confirmed' })}
              className={inputClass}
            >
              <option value="confirmed">Confirmed</option>
              <option value="requested">Requested (confirm later)</option>
            </select>
          </Labeled>
        </div>

        <Labeled id={`${id}-notes`} label="Notes" hint="What the customer described. Up to 2000 characters.">
          <textarea id={`${id}-notes`} rows={3} maxLength={2000} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
        </Labeled>
      </form>
      {known && known.vehicles.length > 0 && (
        <CarPicker
          open={pickerOpen}
          customer={known}
          selected={carFrom && !carFrom.edited ? carFrom.key : null}
          onPick={applyCar}
          onNewCar={newCar}
          onManual={() => setPickerOpen(false)}
        />
      )}
    </Dialog>
  );
}
