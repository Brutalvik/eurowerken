import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { ServiceRow } from '@eurowerken/shared';
import {
  createStaffBooking,
  errorMessage,
  newBookingDraft,
  suggestedDuration,
  validateStaffBooking,
} from '@/api/appointments';
import type { Appointment, BookingContext, SiteSlug, StaffBookingDraft, Technician } from '@/api/appointments';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { TimeFields } from './TimeFields';

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
  onClose: () => void;
  onCreated: (appt: Appointment) => void;
}

export function NewAppointmentDialog(props: NewAppointmentDialogProps) {
  // Remount on each open so the form starts empty.
  if (!props.open) return null;
  return <BookingForm {...props} />;
}

function BookingForm({ workshopId, userId, ctx, site, services, technicians, day, onClose, onCreated }: NewAppointmentDialogProps) {
  const id = useId();
  const formId = `${id}-form`;
  const [draft, setDraft] = useState<StaffBookingDraft>(() => newBookingDraft(day, ctx.settings.slot_minutes));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const active = services.filter((s) => s.active);
  const set = (patch: Partial<StaffBookingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function toggleService(serviceId: string, on: boolean) {
    setDraft((d) => {
      const ids = on ? [...d.service_ids, serviceId] : d.service_ids.filter((x) => x !== serviceId);
      const duration = d.durationEdited ? d.duration : String(Math.max(30, suggestedDuration(ids.length, ctx.settings.slot_minutes)));
      return { ...d, service_ids: ids, duration };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateStaffBooking(draft, services, ctx.settings.time_zone);
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
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg3">Car</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Labeled id={`${id}-make`} label="Make">
              <input id={`${id}-make`} value={draft.make} maxLength={40} onChange={(e) => set({ make: e.target.value })} className={inputClass} placeholder="BMW" />
            </Labeled>
            <Labeled id={`${id}-model`} label="Model">
              <input id={`${id}-model`} value={draft.model} maxLength={60} onChange={(e) => set({ model: e.target.value })} className={inputClass} placeholder="330i" />
            </Labeled>
            <Labeled id={`${id}-year`} label="Year">
              <input id={`${id}-year`} inputMode="numeric" value={draft.year} maxLength={4} onChange={(e) => set({ year: e.target.value })} className={inputClass} />
            </Labeled>
            <Labeled id={`${id}-plate`} label="Plate">
              <input id={`${id}-plate`} value={draft.plate} maxLength={20} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} className={inputClass} />
            </Labeled>
          </div>
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
    </Dialog>
  );
}
