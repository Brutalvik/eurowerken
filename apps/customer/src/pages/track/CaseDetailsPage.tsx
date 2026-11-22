import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Camera,
  Car,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Hash,
  Loader2,
  Lock,
  MessageSquare,
  NotebookPen,
  Phone,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { GST_RATE, itemAmount, postMessage, repairTotals, respondToItems, useTrackedRepair, vehicleName } from '@/api/repairs';
import type { Decision, RepairItem, RepairMessage, TrackedRepair } from '@/api/repairs';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, DemoNotice, telHref } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import {
  ApprovalPill,
  LookupForm,
  MediaGrid,
  RepairTimeline,
  StaleNote,
  StatusPill,
  TechnicianCard,
  Totals,
  WorkshopUpdates,
  formatDay,
  formatWhen,
  repairTimeZone,
  useRepairContact,
} from './repairUi';

/**
 * Repair Case Details: /:slug/track/:caseId, where caseId is the tracking code.
 * Same lookup rules as the tracking page: a contact verified in this tab, or
 * the signed-in owner's account; otherwise the lookup form is shown.
 */
export function CaseDetailsPage() {
  const site = useSite();
  const { caseId = '' } = useParams();
  const code = caseId.trim().toUpperCase();
  const access = useRepairContact(code || null);
  const tracked = useTrackedRepair(code || null, access.ready ? access.contact : null);
  const [formError, setFormError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterLookup = useRef(false);

  useEffect(() => {
    document.title = `Repair ${code} | ${site.display_name}`;
  }, [code, site.display_name]);

  const { error, data } = tracked;
  const { contact, fromAccount, reject } = access;
  useEffect(() => {
    if (!error || !contact) return;
    setFormError(fromAccount ? null : error);
    reject();
  }, [error, contact, fromAccount, reject]);

  useEffect(() => {
    if (data && focusAfterLookup.current) {
      focusAfterLookup.current = false;
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  }, [data]);

  const crumbs = [
    { label: 'Home', to: sitePath(site) },
    { label: 'Repair Tracking', to: `${sitePath(site, 'track')}${code ? `?id=${encodeURIComponent(code)}` : ''}` },
    { label: `Case ${code}` },
  ];

  if (!access.ready || (contact && tracked.loading && !data)) {
    return (
      <>
        <Breadcrumbs items={crumbs} />
        <div aria-busy="true" className="container-site py-6 sm:py-8">
          <p className="sr-only" role="status">
            Loading your repair
          </p>
          <div aria-hidden className="space-y-6">
            <div className="glass-strong h-28 animate-pulse rounded-2xl motion-reduce:animate-none" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="glass h-80 animate-pulse rounded-2xl motion-reduce:animate-none" />
              <div className="glass h-80 animate-pulse rounded-2xl motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!data || !contact) {
    return (
      <>
        <Breadcrumbs items={crumbs} />
        <section aria-labelledby="case-lookup-title" className="container-site py-10 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-accent" aria-hidden />
            <h1 id="case-lookup-title" className="mt-4 font-display text-2xl font-bold text-fg sm:text-3xl">
              Confirm it is you
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-fg2">
              To open repair <span className="break-all font-mono font-semibold text-fg">{code}</span>, enter the email or phone number you booked with.
            </p>
          </div>
          <div className="mt-6">
            <LookupForm
              initialCode={code}
              lockCode
              initialError={formError}
              onFound={(found, typed) => {
                setFormError(null);
                focusAfterLookup.current = true;
                if (found === code) access.setTyped(typed);
              }}
            />
          </div>
          <p className="mt-6 text-center">
            <Link to={sitePath(site, 'track')} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Look up a different repair
            </Link>
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <CaseDetails
        key={data.repair.id}
        tracked={data}
        contact={contact}
        stale={tracked.stale}
        onRetry={() => void tracked.refresh()}
        onUpdate={tracked.replace}
        headingRef={headingRef}
      />
    </>
  );
}

function Card({ title, Icon, aside, children, className = '', id }: { title: string; Icon: typeof Car; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`glass min-w-0 scroll-mt-24 rounded-2xl p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id ? `${id}-title` : undefined} className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

interface CaseProps {
  tracked: TrackedRepair;
  contact: string;
  stale: boolean;
  onRetry: () => void;
  onUpdate: (data: TrackedRepair) => void;
  headingRef: RefObject<HTMLHeadingElement>;
}

function CaseDetails({ tracked, contact, stale, onRetry, onUpdate, headingRef }: CaseProps) {
  const site = useSite();
  const location = useLocation();
  const [notice, setNotice] = useState<'pickup' | 'pay' | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const { repair, items, events, media } = tracked;
  const tz = repairTimeZone(repair);
  const totals = repairTotals(items);
  const name = vehicleName(repair.vehicle);

  // React Router does not scroll to #hash targets; do it once the page is drawn.
  useEffect(() => {
    const target = location.hash.slice(1);
    if (!target) return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    if (target === 'messages') messageInputRef.current?.focus({ preventScroll: true });
  }, [location.hash]);

  function goToMessages() {
    document.getElementById('messages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    messageInputRef.current?.focus({ preventScroll: true });
  }

  const callLine = site.phone ? ` or call the workshop on ${site.phone}` : '';

  return (
    <div className="container-site space-y-6 py-6 sm:py-8">
      {stale && <StaleNote onRetry={onRetry} />}

      {/* Header */}
      <section className="glass-strong rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Photo name="garage-car" alt="" icon={Car} className="hidden h-16 w-24 shrink-0 rounded-xl min-[420px]:block sm:h-20 sm:w-32" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 ref={headingRef} tabIndex={-1} className="break-words font-display text-xl font-bold text-fg outline-none sm:text-2xl">
                  {name}
                </h1>
                <StatusPill status={repair.status} />
              </div>
              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg3">
                <div className="flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" aria-hidden />
                  <dt className="sr-only">Tracking ID</dt>
                  <dd className="font-mono font-medium text-fg2">{repair.tracking_code}</dd>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  <dt className="sr-only">Work order</dt>
                  <dd className="font-medium text-fg2">{repair.number}</dd>
                </div>
                {repair.vehicle.plate && (
                  <div className="flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" aria-hidden />
                    <dt className="sr-only">License plate</dt>
                    <dd className="font-medium text-fg2">{repair.vehicle.plate}</dd>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  <dt>Checked in</dt>
                  <dd className="font-medium text-fg2">{formatDay(repair.created_at, tz)}</dd>
                </div>
                {repair.promised_at && repair.status !== 'completed' && (
                  <div className="flex items-center gap-1">
                    <dt>Promised for</dt>
                    <dd className="font-medium text-fg2">{formatWhen(repair.promised_at, tz)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-outline min-h-11 py-2.5"
              aria-expanded={notice === 'pickup'}
              aria-controls="case-notice"
              onClick={() => setNotice((n) => (n === 'pickup' ? null : 'pickup'))}
            >
              <CalendarClock className="h-4 w-4" aria-hidden />
              Schedule Pickup
            </button>
            <button
              type="button"
              className="btn-ink min-h-11 bg-accent py-2.5 text-accent-fg shadow-accent/20"
              aria-expanded={notice === 'pay'}
              aria-controls="case-notice"
              onClick={() => setNotice((n) => (n === 'pay' ? null : 'pay'))}
            >
              <CreditCard className="h-4 w-4" aria-hidden />
              Pay Invoice
            </button>
          </div>
        </div>
        <div id="case-notice" aria-live="polite">
          {notice && (
            <div className="mt-4">
              <DemoNotice>
                {notice === 'pay'
                  ? `Paying online is coming soon. For now you can pay ${formatMoney(totals.total)} at pickup${callLine}.`
                  : `Booking a pickup time online is coming soon. We will let you know when your car is ready; to arrange a time, message us below${callLine}.`}
              </DemoNotice>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left column */}
        <div className="min-w-0 space-y-6">
          <Card title="Your Technician" Icon={User}>
            <TechnicianCard technician={repair.technician}>
              <div className={`mt-4 grid gap-2 ${site.phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {site.phone && (
                  <a href={telHref(site.phone)} className="btn-outline min-h-11 px-3 py-2.5">
                    <Phone className="h-4 w-4" aria-hidden />
                    Call
                  </a>
                )}
                <button type="button" onClick={goToMessages} className="btn-ink min-h-11 bg-accent px-3 py-2.5 text-accent-fg shadow-accent/20">
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Message
                </button>
              </div>
            </TechnicianCard>
          </Card>

          <Card title="Repair Timeline" Icon={ClipboardList}>
            <RepairTimeline tracked={tracked} />
          </Card>
        </div>

        {/* Right column */}
        <div className="min-w-0 space-y-6">
          <WorkOrder tracked={tracked} contact={contact} onUpdate={onUpdate} />

          <Card title="Technician Notes" Icon={NotebookPen}>
            <WorkshopUpdates events={events} timeZone={tz} />
          </Card>

          <Card title="Photos & Video" Icon={Camera} id="photos">
            <MediaGrid media={media} columns="sm:grid-cols-2 xl:grid-cols-3" />
          </Card>
        </div>
      </div>

      <Messages tracked={tracked} contact={contact} onUpdate={onUpdate} inputRef={messageInputRef} />
    </div>
  );
}

// Work order -----------------------------------------------------------------------------------------

const KIND_LABEL: Record<RepairItem['kind'], string> = { service: 'Service', labour: 'Labour', part: 'Part', fee: 'Fee' };

function WorkOrder({ tracked, contact, onUpdate }: { tracked: TrackedRepair; contact: string; onUpdate: (data: TrackedRepair) => void }) {
  const site = useSite();
  const { repair, items } = tracked;
  const totals = repairTotals(items);
  const [confirming, setConfirming] = useState<{ id: string; decision: Decision } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  /** Decisions made on this page, to show the result where the buttons were. */
  const [done, setDone] = useState<Record<string, Decision>>({});
  const [announcement, setAnnouncement] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const resultRefs = useRef(new Map<string, HTMLParagraphElement>());
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusResultFor = useRef<string | null>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    const id = focusResultFor.current;
    if (!id) return;
    focusResultFor.current = null;
    resultRefs.current.get(id)?.focus();
  }, [done]);

  function cancelConfirm() {
    const c = confirming;
    setConfirming(null);
    if (c) requestAnimationFrame(() => triggerRefs.current.get(`${c.id}:${c.decision}`)?.focus());
  }

  async function submit(item: RepairItem, decision: Decision) {
    setBusy(true);
    setError(null);
    const res = await respondToItems(site.slug, repair.tracking_code, contact, [item.id], decision);
    setBusy(false);
    if (res.error !== null) {
      setError({ id: item.id, message: res.error });
      return;
    }
    setConfirming(null);
    onUpdate(res.data);
    focusResultFor.current = item.id;
    setDone((d) => ({ ...d, [item.id]: decision }));
    const after = repairTotals(res.data.items);
    setAnnouncement(
      decision === 'approved'
        ? `${item.description} approved. The total is now ${formatMoney(after.total)} including GST.`
        : `${item.description} declined. This work will not be done.`,
    );
  }

  return (
    <section aria-labelledby="work-order-title" className="glass min-w-0 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="work-order-title" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <FileText className="h-4 w-4 text-accent" aria-hidden />
            Work Order {repair.number}
          </h2>
          <p className="mt-1 text-xs text-fg3">
            {totals.pendingCount > 0 ? 'Review the work waiting for your approval.' : 'The work on your vehicle and what it costs.'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-fg3">Total with GST</p>
          <p className="font-display text-2xl font-bold tabular-nums text-fg">{formatMoney(totals.total)}</p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {items.length === 0 ? (
        <p className="mt-5 text-sm text-fg2">No work has been added yet. The estimate appears here once the technician has looked at your vehicle.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item) => {
            const amount = itemAmount(item);
            const pending = item.approval === 'pending';
            const declined = item.approval === 'declined';
            const confirm = confirming?.id === item.id ? confirming : null;
            const decided = done[item.id];
            const gst = Math.round(amount * GST_RATE * 100) / 100;
            return (
              <li
                key={item.id}
                className={`rounded-xl border p-4 ${pending ? 'border-warn/40 bg-warn/5' : declined ? 'border-line bg-surface2/40' : 'border-line bg-surface/60'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <h3 className={`min-w-0 break-words text-sm font-semibold ${declined ? 'text-fg3 line-through' : 'text-fg'}`}>{item.description}</h3>
                  <p className={`text-sm font-semibold tabular-nums ${declined ? 'text-fg3 line-through' : 'text-fg'}`}>{formatMoney(amount)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] text-fg2">{KIND_LABEL[item.kind]}</span>
                  {item.quantity !== 1 && (
                    <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] text-fg2">
                      {item.quantity} x {formatMoney(item.unit_price)}
                    </span>
                  )}
                  <ApprovalPill approval={item.approval} />
                </div>

                {pending && !confirm && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      ref={(el) => {
                        if (el) triggerRefs.current.set(`${item.id}:declined`, el);
                      }}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        setConfirming({ id: item.id, decision: 'declined' });
                      }}
                      aria-label={`Decline ${item.description}, ${formatMoney(amount)}`}
                      className="btn-outline min-h-11 px-4 py-2 disabled:opacity-60"
                    >
                      <X className="h-4 w-4" aria-hidden />
                      Decline
                    </button>
                    <button
                      ref={(el) => {
                        if (el) triggerRefs.current.set(`${item.id}:approved`, el);
                      }}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        setConfirming({ id: item.id, decision: 'approved' });
                      }}
                      aria-label={`Approve ${item.description} for ${formatMoney(amount)}`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ok px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Approve
                    </button>
                  </div>
                )}

                {pending && confirm && (
                  <div role="group" aria-labelledby={`confirm-${item.id}`} className="mt-4 rounded-xl border border-line bg-surface/80 p-3">
                    <p id={`confirm-${item.id}`} className="text-sm text-fg">
                      {confirm.decision === 'approved' ? (
                        <>
                          Approve <span className="font-semibold">{item.description}</span> for <span className="font-semibold">{formatMoney(amount)}</span> plus{' '}
                          {formatMoney(gst)} GST ({formatMoney(amount + gst)})? The workshop will go ahead with this work.
                        </>
                      ) : (
                        <>
                          Decline <span className="font-semibold">{item.description}</span> ({formatMoney(amount)})? This work will not be done.
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-fg3">You cannot change this here afterwards. To change your mind, message the workshop.</p>
                    {error?.id === item.id && (
                      <p role="alert" className="mt-2 text-xs text-bad">
                        {error.message}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        ref={confirmRef}
                        type="button"
                        disabled={busy}
                        onClick={() => void submit(item, confirm.decision)}
                        className={
                          confirm.decision === 'approved'
                            ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ok px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60'
                            : 'btn-ink min-h-11 px-4 py-2 disabled:opacity-60'
                        }
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                        {confirm.decision === 'approved' ? `Yes, approve ${formatMoney(amount)}` : 'Yes, decline'}
                      </button>
                      <button type="button" disabled={busy} onClick={cancelConfirm} className="btn-outline min-h-11 px-4 py-2 disabled:opacity-60">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!pending && decided && (
                  <p
                    ref={(el) => {
                      if (el) resultRefs.current.set(item.id, el);
                      else resultRefs.current.delete(item.id);
                    }}
                    tabIndex={-1}
                    className="mt-3 text-xs text-fg2 outline-none"
                  >
                    {item.approval === 'approved'
                      ? 'You approved this. It is added to your total.'
                      : item.approval === 'declined'
                        ? 'You declined this. It will not be done.'
                        : `Your decision was saved (${decided}).`}{' '}
                    To change your mind, message the workshop.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Totals items={items} />
    </section>
  );
}

// Messages -----------------------------------------------------------------------------------------------

function Messages({
  tracked,
  contact,
  onUpdate,
  inputRef,
}: {
  tracked: TrackedRepair;
  contact: string;
  onUpdate: (data: TrackedRepair) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
}) {
  const site = useSite();
  const { repair, messages } = tracked;
  const tz = repairTimeZone(repair);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const workshop = repair.technician?.name ?? site.display_name;

  // Announce workshop messages that arrive while the page is open (not the ones there at first).
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    const fresh = messages.filter((m) => !seen.current!.has(m.id));
    for (const m of fresh) seen.current.add(m.id);
    const incoming = fresh.filter((m) => m.sender === 'staff');
    if (incoming.length === 1) {
      const m = incoming[0]!;
      setAnnouncement(`New message from ${m.author_name ?? site.display_name}: ${m.body}`);
    } else if (incoming.length > 1) {
      setAnnouncement(`${incoming.length} new messages from the workshop.`);
    }
  }, [messages, site.display_name]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const res = await postMessage(site.slug, repair.tracking_code, contact, text);
    setSending(false);
    if (res.error !== null) {
      setError(res.error);
      inputRef.current?.focus();
      return;
    }
    onUpdate(res.data);
    setDraft('');
    setAnnouncement('Message sent.');
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section id="messages" aria-labelledby="messages-title" className="glass min-w-0 scroll-mt-24 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="messages-title" className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          <MessageSquare className="h-4 w-4 text-accent" aria-hidden />
          Messages
        </h2>
        <span className="flex items-center gap-1 text-[11px] text-fg3">
          <Lock className="h-3 w-3" aria-hidden />
          With {site.display_name}
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {messages.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-fg2 sm:px-6">No messages yet. Ask a question about your repair and the workshop will answer here.</p>
      ) : (
        <ol ref={listRef} aria-label="Message thread" tabIndex={0} className="max-h-[28rem] space-y-4 overflow-y-auto px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-accent/30 sm:px-6">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} timeZone={tz} workshopName={site.display_name} />
          ))}
        </ol>
      )}

      <form onSubmit={(e) => void send(e)} className="border-t border-line p-3 sm:p-4">
        <label htmlFor="message-input" className="sr-only">
          Message to {workshop === site.display_name ? site.display_name : `${workshop} at ${site.display_name}`}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id="message-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message..."
            autoComplete="off"
            rows={2}
            maxLength={2000}
            aria-describedby={`message-hint${error ? ' message-error' : ''}`}
            aria-invalid={error ? true : undefined}
            className="input min-w-0 flex-1 resize-y"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="btn-ink min-h-11 min-w-11 shrink-0 bg-accent px-4 py-2.5 text-accent-fg shadow-accent/20 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        {error && (
          <p id="message-error" role="alert" className="mt-2 text-xs text-bad">
            {error}
          </p>
        )}
        <p id="message-hint" className="mt-2 text-[11px] text-fg3">
          Enter sends, Shift and Enter adds a line. {draft.length > 1800 ? `${2000 - draft.length} characters left.` : ''}
        </p>
      </form>
    </section>
  );
}

function MessageBubble({ message: m, timeZone, workshopName }: { message: RepairMessage; timeZone: string; workshopName: string }) {
  const mine = m.sender === 'customer';
  const author = mine ? 'You' : (m.author_name ?? workshopName);
  return (
    <li className={`flex items-end gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && (
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <User className="h-4 w-4" />
        </span>
      )}
      <div className={`min-w-0 max-w-[85%] sm:max-w-[70%] ${mine ? 'text-right' : ''}`}>
        <p className="sr-only">{author} said:</p>
        <p
          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
            mine ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md border border-line bg-surface2 text-fg'
          }`}
        >
          {m.body}
        </p>
        <p className="mt-1 px-1 text-[11px] text-fg3">
          {!mine && <span className="font-medium text-fg2">{author} </span>}
          <time dateTime={m.created_at}>{formatWhen(m.created_at, timeZone)}</time>
        </p>
      </div>
    </li>
  );
}
