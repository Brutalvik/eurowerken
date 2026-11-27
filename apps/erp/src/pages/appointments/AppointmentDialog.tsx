import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Car, ClipboardList, Mail, Phone } from 'lucide-react';
import {
  assignTechnician,
  canReschedule,
  checkInAppointment,
  dayKeyOf,
  errorMessage,
  formatDateTime,
  formatDuration,
  formatTimeRange,
  formatDayKey,
  isDayKey,
  isTimeText,
  rescheduleAppointment,
  saveStaffNotes,
  startTimeProblem,
  statusActions,
  telHref,
  timeInputOf,
  updateAppointmentStatus,
  vehicleLabel,
  zonedToUtc,
} from '@/api/appointments';
import type { Appointment, BookingContext, SiteSlug, StatusAction, Technician } from '@/api/appointments';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_TONE } from '@/lib/status';
import { Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { TimeFields } from './TimeFields';

interface AppointmentDialogProps {
  appt: Appointment | null;
  workshopId: string;
  ctx: BookingContext;
  site: SiteSlug | null;
  technicians: Technician[];
  canEdit: boolean;
  onChanged: (appt: Appointment) => void;
  /** Tells the page's live region what happened. */
  announce: (message: string) => void;
  onClose: () => void;
}

export function AppointmentDialog(props: AppointmentDialogProps) {
  const { appt, onClose } = props;
  return (
    <Dialog open={appt !== null} title={appt ? `Booking ${appt.reference}` : 'Booking'} onClose={onClose} closeOnBackdrop={false} footer={
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    }>
      {/* Keyed per booking so drafts start fresh for each one. */}
      {appt && <Details key={appt.id} {...props} appt={appt} />}
    </Dialog>
  );
}

const linkClass =
  'inline-flex min-w-0 items-center gap-2 break-all rounded text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11';

const URGENCY_LABEL: Record<Appointment['urgency'], string> = {
  routine: 'Routine',
  soon: 'Soon',
  urgent: 'Urgent',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-[10px] font-medium uppercase tracking-wider text-fg3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg3">{label}</dt>
      <dd className="mt-0.5 break-words text-fg">{children}</dd>
    </div>
  );
}

function Details({ appt, workshopId, ctx, site, technicians, canEdit, onChanged, announce }: AppointmentDialogProps & { appt: Appointment }) {
  const id = useId();
  const tz = ctx.settings.time_zone;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The repair order made at check-in, linked from the notice. */
  const [repairOrder, setRepairOrder] = useState<{ id: string; number: string } | null>(null);

  // Status change that needs a reason (cancel or decline).
  const [asking, setAsking] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');

  // Reschedule draft.
  const [day, setDay] = useState(dayKeyOf(appt.starts_at, tz));
  const [time, setTime] = useState(timeInputOf(appt.starts_at, tz));
  const [duration, setDuration] = useState(String(appt.duration_minutes));
  const [warnings, setWarnings] = useState<string[]>([]);

  const [notes, setNotes] = useState(appt.staff_notes ?? '');

  // A fresh copy from elsewhere (for example after a reload) resets the drafts that were not touched.
  useEffect(() => {
    setNotes(appt.staff_notes ?? '');
  }, [appt.staff_notes]);

  const moved =
    day !== dayKeyOf(appt.starts_at, tz) || time !== timeInputOf(appt.starts_at, tz) || duration !== String(appt.duration_minutes);

  async function run(label: string, work: () => Promise<Appointment>, done: (a: Appointment) => string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    setRepairOrder(null);
    try {
      const updated = await work();
      onChanged(updated);
      const msg = done(updated);
      setNotice(msg);
      announce(msg);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'The change was not saved.'));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function onAction(action: StatusAction) {
    if (action.needsReason) {
      setAsking(action);
      setReason('');
      return;
    }
    if (action.to === 'checked_in') {
      void checkIn();
      return;
    }
    void run(action.label, () => updateAppointmentStatus(appt, action.to), (a) => `Booking ${a.reference} is now ${APPOINTMENT_STATUS_LABEL[a.status].toLowerCase()}.`);
  }

  /** Check-in creates (or finds) the repair order. A technician is optional and can be assigned later. */
  async function checkIn() {
    let ro: { id: string; number: string } | null = null;
    const ok = await run(
      'Check in',
      async () => {
        const { result, appt: fresh } = await checkInAppointment(appt, appt.technician_id);
        ro = { id: result.repair_order_id, number: result.repair_order_number };
        return fresh;
      },
      () => `Checked in. Repair order ${ro?.number ?? ''} created.`,
    );
    if (ok && ro) setRepairOrder(ro);
  }

  async function confirmReason() {
    if (!asking) return;
    const ok = await run(asking.label, () => updateAppointmentStatus(appt, asking.to, reason), (a) => `Booking ${a.reference} is cancelled.`);
    if (ok) setAsking(null);
  }

  function saveMove() {
    if (!isDayKey(day) || !isTimeText(time)) {
      setError('Choose a date and a start time.');
      return;
    }
    const problem = startTimeProblem(day, time, Number(duration), ctx);
    if (problem) {
      setError(problem);
      return;
    }
    void run(
      'move',
      () => rescheduleAppointment(appt, zonedToUtc(day, time, tz), Number(duration)),
      (a) => `Booking moved to ${formatDayKey(dayKeyOf(a.starts_at, tz), 'medium')}, ${formatTimeRange(a, tz)}.`,
    );
  }

  const actions = statusActions(appt.status);
  const car = vehicleLabel(appt.vehicle);
  const tech = technicians.find((t) => t.id === appt.technician_id);
  const estimate =
    appt.estimate_low !== null
      ? appt.estimate_high !== null && appt.estimate_high !== appt.estimate_low
        ? `${formatCurrency(appt.estimate_low)} to ${formatCurrency(appt.estimate_high)}`
        : formatCurrency(appt.estimate_low)
      : null;

  return (
    <div className="space-y-5 text-xs">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={APPOINTMENT_TONE[appt.status]}>{APPOINTMENT_STATUS_LABEL[appt.status]}</Badge>
          {appt.urgency !== 'routine' && <Badge tone={appt.urgency === 'urgent' ? 'bad' : 'warn'}>{URGENCY_LABEL[appt.urgency]}</Badge>}
          <Badge tone="neutral">{appt.source === 'staff' ? 'Booked by staff' : 'Booked online'}</Badge>
        </div>
        <p className="font-display text-base font-semibold text-fg">{appt.contact_name}</p>
        <p className="text-fg2">
          {formatDayKey(dayKeyOf(appt.starts_at, tz), 'long')}, {formatTimeRange(appt, tz)} ({formatDuration(appt.duration_minutes)})
        </p>
      </div>

      <div aria-live="polite" role="status">
        {notice && repairOrder ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-ok">
            <span>Repair order {repairOrder.number} created</span>
            <Link
              to={`/repair-orders/${encodeURIComponent(repairOrder.id)}`}
              className="inline-flex items-center rounded font-semibold text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11"
            >
              Open repair order {repairOrder.number}
            </Link>
          </p>
        ) : (
          notice && <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-ok">{notice}</p>
        )}
      </div>
      <ErrorNote errors={error} />

      {canEdit && actions.length > 0 && (
        <Section id={`${id}-status`} title="Status">
          {asking ? (
            <div className="space-y-2 rounded-xl glass-field p-3">
              <Labeled id={`${id}-reason`} label={`Reason (${asking.label.toLowerCase()})`} hint="Up to 300 characters. The customer may see it.">
                <textarea
                  id={`${id}-reason`}
                  rows={2}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </Labeled>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void confirmReason()} disabled={busy !== null} className="!bg-bad">
                  {busy ? 'Saving...' : asking.label === 'Decline' ? 'Decline booking' : 'Cancel booking'}
                </Button>
                <Button variant="ghost" onClick={() => setAsking(null)} disabled={busy !== null}>
                  Keep booking
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button
                  key={a.to}
                  variant={a.kind === 'primary' ? 'primary' : 'ghost'}
                  onClick={() => onAction(a)}
                  disabled={busy !== null}
                  className={a.kind === 'danger' ? '!border-bad/40 !text-bad' : ''}
                >
                  {busy === a.label ? 'Saving...' : a.label}
                </Button>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section id={`${id}-contact`} title="Contact">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Email">
            <a href={`mailto:${appt.contact_email}`} className={linkClass}>
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {appt.contact_email}
            </a>
          </Item>
          <Item label="Phone">
            {appt.contact_phone ? (
              <a href={telHref(appt.contact_phone)} className={linkClass}>
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {appt.contact_phone}
              </a>
            ) : (
              <span className="text-fg3">Not given</span>
            )}
          </Item>
          <Item label="Reminders">
            {[appt.remind_email && 'Email', appt.remind_sms && 'Text message'].filter(Boolean).join(' and ') || 'None'}
          </Item>
          <Item label="Customer account">{appt.customer_id ? 'Signed in when booking' : 'Guest booking'}</Item>
        </dl>
      </Section>

      <Section id={`${id}-car`} title="Car">
        <div className="flex gap-3 rounded-lg border border-line/70 bg-surface2/50 p-3">
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-fg3" aria-hidden />
          <dl className="grid min-w-0 flex-1 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Item label="Vehicle">{car || <span className="text-fg3">Not given</span>}</Item>
            <Item label="Plate">{appt.vehicle.plate || <span className="text-fg3">Not given</span>}</Item>
            <Item label="VIN">
              <span className="break-all font-mono">{appt.vehicle.vin || <span className="font-sans text-fg3">Not given</span>}</span>
            </Item>
          </dl>
        </div>
      </Section>

      <Section id={`${id}-services`} title="Services and estimate">
        {appt.services.length === 0 ? (
          <p className="text-fg2">No services chosen. See the customer's notes.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line/70">
            {appt.services.map((s) => (
              <li key={s.id || s.name} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 break-words text-fg">{s.name}</span>
                <span className="shrink-0 text-fg2">{s.price_from > 0 ? `from ${formatCurrency(s.price_from)}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Estimate">{estimate ?? <span className="text-fg3">None</span>}</Item>
          <Item label="Deposit">{appt.deposit_requested ? 'Requested by the customer' : 'Not requested'}</Item>
        </dl>
      </Section>

      <Section id={`${id}-request`} title="Request">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Urgency">{URGENCY_LABEL[appt.urgency]}</Item>
          <Item label="Source">{appt.source === 'staff' ? 'Staff booking' : 'Online booking'}</Item>
          <Item label="Created">{formatDateTime(appt.created_at, tz)}</Item>
          <Item label="Confirmed">{appt.confirmed_at ? formatDateTime(appt.confirmed_at, tz) : <span className="text-fg3">Not yet</span>}</Item>
          {appt.cancelled_at && <Item label="Cancelled">{formatDateTime(appt.cancelled_at, tz)}</Item>}
          {appt.cancel_reason && <Item label="Cancel reason">{appt.cancel_reason}</Item>}
        </dl>
        <div>
          <p className="text-fg3">Customer's notes</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-fg">{appt.notes || <span className="text-fg3">None</span>}</p>
        </div>
      </Section>

      {canEdit && canReschedule(appt.status) && (
        <Section id={`${id}-move`} title="Reschedule">
          <TimeFields
            workshopId={workshopId}
            ctx={ctx}
            site={site}
            excludeId={appt.id}
            day={day}
            time={time}
            duration={duration}
            disabled={busy !== null}
            onWarnings={setWarnings}
            onChange={(p) => {
              if (p.day !== undefined) setDay(p.day);
              if (p.time !== undefined) setTime(p.time);
              if (p.duration !== undefined) setDuration(p.duration);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveMove} disabled={!moved || busy !== null}>
              {busy === 'move' ? 'Moving...' : warnings.length > 0 ? 'Move anyway' : 'Move booking'}
            </Button>
            {moved && (
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => {
                  setDay(dayKeyOf(appt.starts_at, tz));
                  setTime(timeInputOf(appt.starts_at, tz));
                  setDuration(String(appt.duration_minutes));
                }}
              >
                Undo changes
              </Button>
            )}
          </div>
        </Section>
      )}

      <Section id={`${id}-tech`} title="Technician">
        {canEdit ? (
          <Labeled id={`${id}-tech-select`} label="Assigned technician">
            <select
              id={`${id}-tech-select`}
              value={appt.technician_id ?? ''}
              disabled={busy !== null}
              onChange={(e) => {
                const next = e.target.value || null;
                const name = technicians.find((t) => t.id === next)?.name;
                void run('tech', () => assignTechnician(appt, next), () => (name ? `${name} is assigned.` : 'No technician assigned.'));
              }}
              className={`${inputClass} sm:max-w-xs`}
            >
              <option value="">Not assigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.role_title ? ` (${t.role_title})` : ''}
                </option>
              ))}
              {appt.technician_id && !tech && <option value={appt.technician_id}>Someone no longer on the team</option>}
            </select>
          </Labeled>
        ) : (
          <p className="text-fg">{tech?.name ?? <span className="text-fg3">Not assigned</span>}</p>
        )}
        {canEdit && technicians.length === 0 && (
          <p className="text-[11px] text-fg3">Add technicians in Settings, Team.</p>
        )}
      </Section>

      <Section id={`${id}-notes`} title="Staff notes">
        {canEdit ? (
          <>
            <Labeled id={`${id}-notes-text`} label="Notes for the team" hint="Not shown to the customer. Up to 2000 characters.">
              <textarea
                id={`${id}-notes-text`}
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
              />
            </Labeled>
            <Button
              variant="ghost"
              disabled={busy !== null || notes.trim() === (appt.staff_notes ?? '').trim()}
              onClick={() => void run('notes', () => saveStaffNotes(appt, notes), () => 'Staff notes saved.')}
            >
              {busy === 'notes' ? 'Saving...' : 'Save notes'}
            </Button>
          </>
        ) : (
          <p className="whitespace-pre-wrap break-words text-fg">{appt.staff_notes || <span className="text-fg3">None</span>}</p>
        )}
      </Section>

      <p className="border-t border-line pt-4 text-[11px] text-fg3">
        <ClipboardList className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        Checking the car in creates its repair order automatically.
      </p>

      {!canEdit && (
        <p className="text-[11px] text-fg3">You can view bookings. Changing them needs full Repair Orders access.</p>
      )}
    </div>
  );
}
