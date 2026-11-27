import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Car, Check, Copy, Link2, Mail, Phone } from 'lucide-react';
import type { PartRow, ServiceRow } from '@eurowerken/shared';
import {
  dayKeyOf,
  errorMessage,
  formatDateTime,
  getSiteSlug,
  getTimeZone,
  isDayKey,
  isTimeText,
  listTechnicians,
  telHref,
  timeInputOf,
  vehicleLabel,
  zonedToUtc,
} from '@/api/appointments';
import type { SiteSlug, Technician } from '@/api/appointments';
import { listParts, listServices } from '@/api/catalogue';
import {
  REPAIR_STATUS_LABEL,
  REPAIR_STATUS_TONE,
  REPAIR_STEPS,
  canCancel,
  getRepairOrder,
  getRepairOrderRow,
  latestApprovalByItem,
  listApprovals,
  listRepairEvents,
  listRepairItems,
  listRepairMessages,
  plateOf,
  repairActions,
  subscribeRepairOrder,
  trackingLink,
  updateRepairOrder,
  updateRepairStatus,
} from '@/api/repairOrders';
import type { RepairAction, RepairApproval, RepairOrder, RepairOrderDetail as Detail } from '@/api/repairOrders';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { Confirm, SectionTitle, iconButton, textLink } from './common';
import { ApprovalHistoryCard, PhoneApprovalDialog } from './RepairApprovals';
import { RepairInvoiceCard } from './RepairInvoiceCard';
import { RepairItemsCard } from './RepairItemsCard';
import { MediaCard } from './RepairMediaCard';
import { MessagesCard, TimelineCard } from './RepairThreadCards';
import { InspectionCard } from './InspectionCard';
import { OrderPartsButton } from './OrderPartsButton';

const URGENCY_LABEL = { routine: 'Routine', soon: 'Soon', urgent: 'Urgent' } as const;

/** A repair order on its own page: header, status steps, line items, media, details, messages and timeline. */
export function RepairOrderDetail() {
  const { id = '' } = useParams();
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('repair-orders', 'full');

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tz, setTz] = useState('America/Edmonton');
  const [site, setSite] = useState<SiteSlug | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [live, setLive] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [approvals, setApprovals] = useState<RepairApproval[]>([]);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  /** The phone approval dialog: closed (null), or open with an optional explanation. */
  const [phone, setPhone] = useState<{ intro: string | null } | null>(null);
  const itemsRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string) => {
    // Clearing first makes a repeated message heard again.
    setLive('');
    window.setTimeout(() => setLive(message), 30);
  }, []);

  const loadApprovals = useCallback(async () => {
    try {
      const list = await listApprovals(id);
      setApprovals(list);
      setApprovalsError(null);
    } catch (err) {
      setApprovalsError(errorMessage(err, 'The approval history could not be loaded.'));
    }
  }, [id]);

  const load = useCallback(async () => {
    setLoadError(null);
    void loadApprovals();
    try {
      const d = await getRepairOrder(id);
      setDetail(d);
    } catch (err) {
      setLoadError(errorMessage(err, 'The repair order could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, loadApprovals]);

  useEffect(() => {
    setDetail(null);
    setApprovals([]);
    setApprovalsError(null);
    setPhone(null);
    setSelecting(false);
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getTimeZone(workshopId).then((t) => active && setTz(t)).catch(() => undefined);
    void getSiteSlug(workshopId).then((s) => active && setSite(s));
    void listTechnicians(workshopId).then((t) => active && setTechnicians(t)).catch(() => undefined);
    if (canEdit) {
      void listServices(workshopId).then((s) => active && setServices(s)).catch(() => undefined);
      void listParts(workshopId).then((p) => active && setParts(p)).catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [workshopId, canEdit]);

  // Live updates from the customer (approvals, messages) and other staff.
  useEffect(() => {
    if (!id) return;
    const patch = (fn: (d: Detail) => Detail) => setDetail((d) => (d ? fn(d) : d));
    const unsubscribe = subscribeRepairOrder(id, (table) => {
      if (table === 'repair_orders') void getRepairOrderRow(id).then((o) => o && patch((d) => ({ ...d, order: o }))).catch(() => undefined);
      if (table === 'repair_order_items') void listRepairItems(id).then((items) => patch((d) => ({ ...d, items }))).catch(() => undefined);
      if (table === 'repair_order_events') void listRepairEvents(id).then((events) => patch((d) => ({ ...d, events }))).catch(() => undefined);
      // A decision changes the items and writes a timeline entry; the records themselves are read again then.
      if (table === 'repair_order_items' || table === 'repair_order_events') void loadApprovals();
      if (table === 'repair_order_messages') void listRepairMessages(id).then((messages) => patch((d) => ({ ...d, messages }))).catch(() => undefined);
    });
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, load, loadApprovals]);

  if (loading && !detail) {
    return (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading repair order...
      </p>
    );
  }

  if (loadError && !detail) {
    return (
      <Card className="space-y-3 p-4">
        <ErrorNote errors={loadError} />
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void load()}>
            Retry
          </Button>
          <Link to="/repair-orders" className={textLink}>
            All repair orders
          </Link>
        </div>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="space-y-3 p-6 text-center text-xs text-fg2">
        <p>This repair order was not found, or your role cannot see it.</p>
        <Link to="/repair-orders" className={`${textLink} justify-center`}>
          All repair orders
        </Link>
      </Card>
    );
  }

  const { order } = detail;
  const setOrder = (o: RepairOrder) => setDetail((d) => (d ? { ...d, order: o } : d));
  const pendingItems = detail.items.filter((i) => i.approval === 'pending');
  const hasPending = pendingItems.length > 0;
  const latest = latestApprovalByItem(approvals);

  function openPhone(intro: string | null = null) {
    setPhone({ intro });
  }

  function askForApproval() {
    setSelecting(true);
    window.setTimeout(() => itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    announce('Choose the items the customer should approve.');
  }

  return (
    <div className="min-w-0 space-y-4">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <Link to="/repair-orders" className={`${textLink} text-xs`}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All repair orders
      </Link>

      <HeaderCard order={order} tz={tz} site={site} announce={announce} />
      <StatusCard
        order={order}
        canEdit={canEdit}
        hasPending={hasPending}
        onOrder={setOrder}
        onAskApproval={askForApproval}
        onNeedPhone={() =>
          openPhone(
            `${pendingItems.length} item${pendingItems.length === 1 ? ' is' : 's are'} still waiting for the customer. Record their answer first; when nothing is waiting any more, the repair moves to in progress by itself.`,
          )
        }
        announce={announce}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div ref={itemsRef} className="scroll-mt-20">
            <RepairItemsCard
              order={order}
              items={detail.items}
              services={services}
              parts={parts}
              canEdit={canEdit}
              selecting={selecting}
              onSelectingChange={setSelecting}
              onItems={(items) => setDetail((d) => (d ? { ...d, items } : d))}
              onOrder={setOrder}
              announce={announce}
              approvals={latest}
              tz={tz}
              onRecordPhone={() => openPhone()}
            />
          </div>
          <ApprovalHistoryCard records={approvals} items={detail.items} tz={tz} error={approvalsError} />
          <InspectionCard order={order} tz={tz} canEdit={canEdit} announce={announce} />
          <MediaCard order={order} media={detail.media} canEdit={canEdit} onMedia={(media) => setDetail((d) => (d ? { ...d, media } : d))} announce={announce} />
        </div>
        <div className="min-w-0 space-y-4">
          <JobCard key={order.id} order={order} tz={tz} technicians={technicians} canEdit={canEdit} onOrder={setOrder} announce={announce} />
          <RepairInvoiceCard repairOrderId={order.id} status={order.status} tz={tz} announce={announce} />
          <OrderPartsButton repairOrderId={order.id} order={order} items={detail.items} />
          <MessagesCard
            order={order}
            messages={detail.messages}
            tz={tz}
            canEdit={canEdit}
            onSent={(m) => setDetail((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d))}
            announce={announce}
          />
          <TimelineCard
            order={order}
            events={detail.events}
            tz={tz}
            canEdit={canEdit}
            onAdded={(ev) => setDetail((d) => (d && !d.events.some((x) => x.id === ev.id) ? { ...d, events: [...d.events, ev] } : d))}
            announce={announce}
          />
        </div>
      </div>

      {canEdit && (
        <PhoneApprovalDialog
          open={phone !== null}
          order={order}
          pending={pendingItems}
          intro={phone?.intro}
          onClose={() => setPhone(null)}
          onDone={(n, decision) => {
            setPhone(null);
            announce(`${n} item${n === 1 ? '' : 's'} ${decision} by phone, recorded.`);
            void load();
          }}
        />
      )}

      {!canEdit && <p className="text-[11px] text-fg3">You can view repair orders. Changing them needs full Repair Orders access.</p>}
    </div>
  );
}

// Header -------------------------------------------------------------------------------------

function HeaderCard({ order, tz, site, announce }: { order: RepairOrder; tz: string; site: SiteSlug | null; announce: (m: string) => void }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const link = trackingLink(site?.slug, order.tracking_code);
  const car = vehicleLabel(order.vehicle);
  const plate = plateOf(order.vehicle);

  async function copy(what: 'code' | 'link', text: string) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      announce(what === 'code' ? 'Tracking code copied.' : 'Customer tracking link copied.');
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      setCopyError(`Copying is blocked in this browser. Select and copy it yourself: ${text}`);
    }
  }

  return (
    <Card className="space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-fg">{order.number}</h2>
            <Badge tone={REPAIR_STATUS_TONE[order.status]}>{REPAIR_STATUS_LABEL[order.status]}</Badge>
            {order.urgency !== 'routine' && <Badge tone={order.urgency === 'urgent' ? 'bad' : 'warn'}>{URGENCY_LABEL[order.urgency]}</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg2">
            <Car className="h-3.5 w-3.5 shrink-0 text-fg3" aria-hidden />
            <span className="font-medium text-fg">{car || 'Vehicle not given'}</span>
            {plate && <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] uppercase text-fg">{plate}</span>}
            {order.vehicle.vin && <span className="break-all font-mono text-[11px] text-fg3">VIN {order.vehicle.vin}</span>}
          </p>
          <p className="text-[11px] text-fg3">
            Checked in {formatDateTime(order.created_at, tz)}
            {order.completed_at ? `. Completed ${formatDateTime(order.completed_at, tz)}` : ''}
          </p>
        </div>
        {order.appointment_id && (
          <Link to={`/appointments?open=${encodeURIComponent(order.appointment_id)}`} className={`${textLink} text-xs`}>
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            View booking
          </Link>
        )}
      </div>

      <div className="grid gap-4 text-xs sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-fg3">Customer</p>
          <p className="font-medium text-fg">{order.contact_name}</p>
          {order.contact_phone && (
            <a href={telHref(order.contact_phone)} className={textLink}>
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {order.contact_phone}
            </a>
          )}
          {order.contact_email && (
            <div>
              <a href={`mailto:${order.contact_email}`} className={textLink}>
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {order.contact_email}
              </a>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-fg3">Tracking code</p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="break-all font-mono text-sm font-semibold text-fg">{order.tracking_code}</span>
            <button type="button" className={iconButton} onClick={() => void copy('code', order.tracking_code)} aria-label="Copy tracking code">
              {copied === 'code' ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
          <Button variant="ghost" size="sm" disabled={!link} onClick={() => link && void copy('link', link)}>
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
            {copied === 'link' ? 'Link copied' : 'Copy customer tracking link'}
          </Button>
          {!link && <p className="text-[11px] text-fg3">Set up the customer website (Settings, Website) to get a tracking link.</p>}
          {site && !site.published && link && <p className="text-[11px] text-warn">The website is not published, so the link does not open for customers yet.</p>}
        </div>
      </div>
      <ErrorNote errors={copyError} />
    </Card>
  );
}

// Status ----------------------------------------------------------------------------------------

interface StatusCardProps {
  order: RepairOrder;
  canEdit: boolean;
  hasPending: boolean;
  onOrder: (o: RepairOrder) => void;
  onAskApproval: () => void;
  /** Items are still pending: the customer's answer has to be recorded before the repair starts. */
  onNeedPhone: () => void;
  announce: (m: string) => void;
}

function StatusCard({ order, canEdit, hasPending, onOrder, onAskApproval, onNeedPhone, announce }: StatusCardProps) {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const current = REPAIR_STEPS.indexOf(order.status);
  const actions = repairActions(order.status);

  async function go(action: RepairAction) {
    if (action.to === 'awaiting_approval' && !hasPending) {
      onAskApproval();
      return;
    }
    if (action.to === 'in_progress' && hasPending) {
      onNeedPhone();
      return;
    }
    setBusy(action.to);
    setError(null);
    try {
      const o = await updateRepairStatus(order, action.to);
      onOrder(o);
      announce(`Status changed to ${REPAIR_STATUS_LABEL[o.status].toLowerCase()}.`);
    } catch (err) {
      setError(errorMessage(err, 'The status could not be changed.'));
      const fresh = await getRepairOrderRow(order.id).catch(() => null);
      if (fresh) onOrder(fresh);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancelled');
    setCancelError(null);
    try {
      const o = await updateRepairStatus(order, 'cancelled');
      onOrder(o);
      setCancelling(false);
      announce('Repair order cancelled.');
    } catch (err) {
      setCancelError(errorMessage(err, 'The repair order could not be cancelled.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4 p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <SectionTitle id={`${id}-title`} title="Progress" />
        {order.status === 'cancelled' ? (
          <p className="rounded-xl glass-field px-3 py-2 text-xs text-fg2">This repair order was cancelled.</p>
        ) : (
          <ol className="flex flex-wrap gap-1.5" aria-label="Repair steps">
            {REPAIR_STEPS.map((s, i) => {
              const done = i < current;
              const now = i === current;
              return (
                <li
                  key={s}
                  aria-current={now ? 'step' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
                    now ? 'glass-active font-semibold' : done ? 'bg-ok/15 text-ok' : 'border border-line text-fg3'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
                  {REPAIR_STATUS_LABEL[s]}
                  {done && <span className="sr-only">(done)</span>}
                </li>
              );
            })}
          </ol>
        )}

        {canEdit && (actions.length > 0 || canCancel(order.status)) && (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a) => (
              <Button key={a.to} variant={a.primary ? 'primary' : 'ghost'} disabled={busy !== null} onClick={() => void go(a)}>
                {busy === a.to ? 'Saving...' : a.to === 'in_progress' && hasPending ? 'Record phone approval to start' : a.label}
              </Button>
            ))}
            {canCancel(order.status) && (
              <Button variant="ghost" className="hover:!text-bad sm:ml-auto" disabled={busy !== null} onClick={() => {
                setCancelError(null);
                setCancelling(true);
              }}>
                Cancel repair order
              </Button>
            )}
          </div>
        )}
        {order.status === 'awaiting_approval' && hasPending && (
          <p className="text-[11px] text-fg2">Waiting for the customer to approve on the tracking page (signed in), or record the answer they gave you with Record phone approval. When everything is answered the repair moves to in progress by itself.</p>
        )}
        <ErrorNote errors={error} />
      </section>

      <Confirm
        open={cancelling}
        title={`Cancel ${order.number}`}
        message={<p>Cancel this repair order? The customer's tracking page stops working and the order can no longer be changed.</p>}
        confirmLabel="Cancel repair order"
        busyLabel="Cancelling..."
        busy={busy === 'cancelled'}
        error={cancelError}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelling(false)}
      />
    </Card>
  );
}

// Technician, promised time, notes ------------------------------------------------------------------

interface JobCardProps {
  order: RepairOrder;
  tz: string;
  technicians: Technician[];
  canEdit: boolean;
  onOrder: (o: RepairOrder) => void;
  announce: (m: string) => void;
}

function JobCard({ order, tz, technicians, canEdit, onOrder, announce }: JobCardProps) {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(order.promised_at ? dayKeyOf(order.promised_at, tz) : '');
  const [time, setTime] = useState(order.promised_at ? timeInputOf(order.promised_at, tz) : '17:00');
  const [notes, setNotes] = useState(order.staff_notes ?? '');

  useEffect(() => {
    setDay(order.promised_at ? dayKeyOf(order.promised_at, tz) : '');
    if (order.promised_at) setTime(timeInputOf(order.promised_at, tz));
  }, [order.promised_at, tz]);
  useEffect(() => setNotes(order.staff_notes ?? ''), [order.staff_notes]);

  async function save(label: string, patch: Parameters<typeof updateRepairOrder>[1], done: string) {
    setBusy(label);
    setError(null);
    try {
      const o = await updateRepairOrder(order.id, patch);
      onOrder(o);
      announce(done);
    } catch (err) {
      setError(errorMessage(err, 'That could not be saved.'));
    } finally {
      setBusy(null);
    }
  }

  function savePromised() {
    if (!day) {
      void save('promised', { promised_at: null }, 'Promised time cleared.');
      return;
    }
    if (!isDayKey(day) || !isTimeText(time)) {
      setError('Enter a valid date and time.');
      return;
    }
    void save('promised', { promised_at: zonedToUtc(day, time, tz).toISOString() }, 'Promised time saved.');
  }

  const promisedChanged = (order.promised_at ? `${dayKeyOf(order.promised_at, tz)} ${timeInputOf(order.promised_at, tz)}` : '') !== (day ? `${day} ${time}` : '');
  const techName = technicians.find((t) => t.id === order.technician_id)?.name;

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-4 text-xs">
        <SectionTitle id={`${id}-title`} title="Job details" />
        {canEdit ? (
          <>
            <Labeled id={`${id}-tech`} label="Technician">
              <select
                id={`${id}-tech`}
                value={order.technician_id ?? ''}
                disabled={busy !== null}
                onChange={(e) => {
                  const name = technicians.find((t) => t.id === e.target.value)?.name;
                  void save('tech', { technician_id: e.target.value || null }, name ? `Assigned to ${name}.` : 'Technician removed.');
                }}
                className={inputClass}
              >
                <option value="">Not assigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.role_title ? `, ${t.role_title}` : ''}
                  </option>
                ))}
              </select>
            </Labeled>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-fg2">Promised for</legend>
              <div className="grid grid-cols-2 gap-2">
                <Labeled id={`${id}-day`} label="Date">
                  <input id={`${id}-day`} type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputClass} />
                </Labeled>
                <Labeled id={`${id}-time`} label="Time">
                  <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} disabled={!day} />
                </Labeled>
              </div>
              <p className="text-[11px] text-fg3">Workshop time ({tz.replace(/_/g, ' ')}). Shown to the customer.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" disabled={!promisedChanged || busy !== null} onClick={savePromised}>
                  {busy === 'promised' ? 'Saving...' : 'Save promised time'}
                </Button>
                {order.promised_at && (
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void save('promised', { promised_at: null }, 'Promised time cleared.')}>
                    Clear
                  </Button>
                )}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Labeled id={`${id}-notes`} label="Staff notes" hint="Only the team sees these. Up to 4000 characters.">
                <textarea id={`${id}-notes`} rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              </Labeled>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" disabled={notes === (order.staff_notes ?? '') || busy !== null} onClick={() => void save('notes', { staff_notes: notes }, 'Staff notes saved.')}>
                  {busy === 'notes' ? 'Saving...' : 'Save notes'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <dl className="space-y-3">
            <Row label="Technician">{techName ?? 'Not assigned'}</Row>
            <Row label="Promised for">{order.promised_at ? formatDateTime(order.promised_at, tz) : 'Not set'}</Row>
            <Row label="Staff notes">{order.staff_notes || 'None'}</Row>
          </dl>
        )}

        {order.customer_notes && (
          <div className="rounded-xl glass-field p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-fg3">Customer notes from the booking</p>
            <p className="mt-1 whitespace-pre-line break-words text-fg">{order.customer_notes}</p>
          </div>
        )}
        <ErrorNote errors={error} />
      </section>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg3">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-fg">{children}</dd>
    </div>
  );
}
