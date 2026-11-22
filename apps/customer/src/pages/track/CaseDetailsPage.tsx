import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode, RefObject } from 'react';
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
  Lock,
  MessageSquare,
  NotebookPen,
  Phone,
  SearchX,
  Send,
  Undo2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, DemoNotice, Pill } from '@/components/ui';
import { findRepairCase } from '@/data/catalog';
import type { RepairCase } from '@/data/catalog';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { MediaGrid, RepairTimeline, StatusPill, TechnicianNotes } from './repairParts';

type Decision = 'approved' | 'declined';
type LineItem = RepairCase['lineItems'][number];
type Message = RepairCase['messages'][number];

export function CaseDetailsPage() {
  const site = useSite();
  const { caseId = '' } = useParams();
  const repair = findRepairCase(caseId);

  if (!repair) {
    return (
      <>
        <Breadcrumbs
          items={[
            { label: 'Home', to: sitePath(site) },
            { label: 'Repair Tracking', to: sitePath(site, 'track') },
            { label: 'Case not found' },
          ]}
        />
        <section className="container-site py-16 sm:py-24">
          <div className="glass mx-auto max-w-lg rounded-3xl p-8 text-center">
            <SearchX className="mx-auto h-10 w-10 text-fg3" aria-hidden />
            <h1 className="mt-4 font-display text-2xl font-bold text-fg">We could not find that repair</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg2">
              There is no repair case with the ID <span className="break-all font-mono font-semibold text-fg">{caseId}</span>. Check the tracking ID
              in your drop-off email or text and look it up again.
            </p>
            <Link to={sitePath(site, 'track')} className="btn-ink mt-6">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Repair Tracking
            </Link>
          </div>
        </section>
      </>
    );
  }

  // Keyed so local state (approvals, messages) resets when the case changes.
  return <CaseDetails key={repair.trackingId} repair={repair} />;
}

function Card({ title, Icon, aside, children, className = '', id }: { title: string; Icon: typeof Car; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`glass scroll-mt-24 rounded-2xl p-5 sm:p-6 ${className}`}>
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

function CaseDetails({ repair }: { repair: RepairCase }) {
  const site = useSite();
  const location = useLocation();
  const [notice, setNotice] = useState<'pickup' | 'pay' | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [announcement, setAnnouncement] = useState('');
  const messageInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () =>
      repair.lineItems.reduce((sum, item) => {
        if (item.state === 'completed' || item.state === 'in-progress') return sum + item.price;
        if (item.state === 'needs-approval' && decisions[item.id] === 'approved') return sum + item.price;
        return sum;
      }, 0),
    [repair.lineItems, decisions],
  );

  // React Router does not scroll to #hash targets; do it once the page is drawn.
  useEffect(() => {
    const target = location.hash.slice(1);
    if (!target) return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    if (target === 'messages') messageInputRef.current?.focus({ preventScroll: true });
  }, [location.hash]);

  function decide(item: LineItem, decision: Decision | null) {
    setDecisions((d) => {
      const next = { ...d };
      if (decision) next[item.id] = decision;
      else delete next[item.id];
      return next;
    });
    setAnnouncement(
      decision === 'approved'
        ? `${item.title} approved. ${formatMoney(item.price)} added to the total.`
        : decision === 'declined'
          ? `${item.title} declined.`
          : `Decision on ${item.title} undone. It needs your approval again.`,
    );
  }

  function goToMessages() {
    document.getElementById('messages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    messageInputRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Home', to: sitePath(site) },
          { label: 'Repair Tracking', to: `${sitePath(site, 'track')}?id=${encodeURIComponent(repair.trackingId)}` },
          { label: `Case ${repair.trackingId}` },
        ]}
      />

      <div className="container-site space-y-6 py-6 sm:py-8">
        {/* Header */}
        <section className="glass-strong rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Photo name="garage-car" alt={repair.vehicle} icon={Car} className="h-16 w-24 shrink-0 rounded-xl sm:h-20 sm:w-32" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-xl font-bold text-fg sm:text-2xl">{repair.vehicle}</h1>
                  <StatusPill status={repair.status} />
                </div>
                <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg3">
                  <div className="flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" aria-hidden />
                    <dt className="sr-only">Tracking ID</dt>
                    <dd className="font-mono font-medium text-fg2">{repair.trackingId}</dd>
                  </div>
                  <div className="flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" aria-hidden />
                    <dt className="sr-only">License plate</dt>
                    <dd className="font-medium text-fg2">{repair.plate}</dd>
                  </div>
                  <div className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    <dt>Dropped off</dt>
                    <dd className="font-medium text-fg2">{repair.droppedOff}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-outline py-2.5"
                aria-expanded={notice === 'pickup'}
                aria-controls="case-notice"
                onClick={() => setNotice((n) => (n === 'pickup' ? null : 'pickup'))}
              >
                <CalendarClock className="h-4 w-4" aria-hidden />
                Schedule Pickup
              </button>
              <button
                type="button"
                className="btn-ink bg-accent py-2.5 text-accent-fg shadow-accent/20"
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
                    ? `Online payment is not connected yet. You can pay ${formatMoney(total)} at pickup, or call ${repair.advisor.name} on ${repair.advisor.phone} to pay by phone.`
                    : `Online pickup scheduling is not connected yet. We will text you when your car is ready; to arrange a time, call ${repair.advisor.name} on ${repair.advisor.phone}.`}
                </DemoNotice>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {/* Left column */}
          <div className="space-y-6">
            <Card title="Service Advisor" Icon={User}>
              <div className="flex items-center gap-3">
                <Photo
                  name={repair.advisor.image}
                  alt={repair.advisor.name}
                  icon={User}
                  className="h-12 w-12 shrink-0 overflow-hidden rounded-full"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{repair.advisor.name}</p>
                  <p className="text-xs text-fg3">{repair.advisor.role}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a href={`tel:${repair.advisor.phone.replace(/[^\d+]/g, '')}`} className="btn-outline px-3 py-2.5">
                  <Phone className="h-4 w-4" aria-hidden />
                  Call
                </a>
                <button type="button" onClick={goToMessages} className="btn-ink bg-accent px-3 py-2.5 text-accent-fg shadow-accent/20">
                  <MessageSquare className="h-4 w-4" aria-hidden />
                  Message
                </button>
              </div>
            </Card>

            <Card title="Repair Timeline" Icon={ClipboardList}>
              <RepairTimeline steps={repair.timeline} progress={repair.progress} />
            </Card>
          </div>

          {/* Right column */}
          <div className="min-w-0 space-y-6">
            <WorkOrder repair={repair} total={total} decisions={decisions} onDecide={decide} announcement={announcement} />

            <div className="grid gap-6 md:grid-cols-2">
              <Card title="Technician Notes" Icon={NotebookPen}>
                <TechnicianNotes notes={repair.notes} />
              </Card>
              <Card title="Photo Evidence" Icon={Camera} id="photos">
                <MediaGrid media={repair.media} columns="" />
              </Card>
            </div>
          </div>
        </div>

        <Messages repair={repair} inputRef={messageInputRef} />
      </div>
    </>
  );
}

const ITEM_STATE: Record<LineItem['state'], { label: string; tone: 'ok' | 'accent' | 'warn' | 'neutral'; Icon: typeof Car }> = {
  completed: { label: 'Completed', tone: 'ok', Icon: CheckCircle2 },
  'in-progress': { label: 'In progress', tone: 'accent', Icon: Wrench },
  'needs-approval': { label: 'Needs approval', tone: 'warn', Icon: FileText },
  pending: { label: 'Pending', tone: 'neutral', Icon: FileText },
};

function WorkOrder({
  repair,
  total,
  decisions,
  onDecide,
  announcement,
}: {
  repair: RepairCase;
  total: number;
  decisions: Record<string, Decision>;
  onDecide: (item: LineItem, decision: Decision | null) => void;
  announcement: string;
}) {
  return (
    <section aria-labelledby="work-order-title" className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="work-order-title" className="flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <FileText className="h-4 w-4 text-accent" aria-hidden />
            Work Order #{repair.workOrder}
          </h2>
          <p className="mt-1 text-xs text-fg3">Review and approve recommended services.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-fg3">Current Total</p>
          <p className="font-display text-2xl font-bold tabular-nums text-fg" aria-live="polite">
            {formatMoney(total)}
          </p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <ul className="mt-5 space-y-3">
        {repair.lineItems.map((item) => {
          const decision = decisions[item.id];
          const meta = ITEM_STATE[item.state];
          const awaiting = item.state === 'needs-approval' && !decision;
          return (
            <li
              key={item.id}
              className={`rounded-xl border p-4 ${
                awaiting
                  ? 'border-warn/40 bg-warn/5'
                  : item.state === 'in-progress'
                    ? 'border-accent/30 bg-accent/5'
                    : decision === 'declined'
                      ? 'border-line bg-surface2/40'
                      : 'border-line bg-surface/60'
              }`}
            >
              <div className="flex gap-3">
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    meta.tone === 'ok' ? 'bg-ok/12 text-ok' : meta.tone === 'accent' ? 'bg-accent/10 text-accent' : meta.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-surface2 text-fg3'
                  }`}
                >
                  <meta.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <h3 className={`text-sm font-semibold ${decision === 'declined' ? 'text-fg3 line-through' : 'text-fg'}`}>{item.title}</h3>
                    <p className={`text-sm font-semibold tabular-nums ${decision === 'declined' ? 'text-fg3 line-through' : 'text-fg'}`}>
                      {formatMoney(item.price)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg2">{item.text}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.parts !== undefined && (
                      <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] text-fg2">Parts: {formatMoney(item.parts)}</span>
                    )}
                    {item.labour && <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] text-fg2">Labour: {item.labour}</span>}
                    {item.state === 'needs-approval' ? (
                      decision ? (
                        <Pill tone={decision === 'approved' ? 'ok' : 'neutral'}>{decision === 'approved' ? 'Approved' : 'Declined'}</Pill>
                      ) : (
                        <Pill tone="warn">Needs approval</Pill>
                      )
                    ) : (
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    )}
                  </div>

                  {item.state === 'needs-approval' && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {decision ? (
                        <>
                          <p className="text-xs text-fg2">
                            {decision === 'approved' ? 'Approved. Added to your total.' : 'Declined. This work will not be done.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => onDecide(item, null)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 coarse:min-h-11"
                          >
                            <Undo2 className="h-3.5 w-3.5" aria-hidden />
                            Undo
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onDecide(item, 'declined')}
                            aria-label={`Decline ${item.title}`}
                            className="btn-outline px-4 py-2 coarse:min-h-11"
                          >
                            <X className="h-4 w-4" aria-hidden />
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => onDecide(item, 'approved')}
                            aria-label={`Approve ${item.title} for ${formatMoney(item.price)}`}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ok px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 coarse:min-h-11"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                            Approve
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-fg3">Approvals here are a preview and are not sent to the workshop yet. Your advisor will confirm by phone.</p>
    </section>
  );
}

function nowTime(): string {
  return new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

function Messages({ repair, inputRef }: { repair: RepairCase; inputRef: RefObject<HTMLInputElement> }) {
  const [messages, setMessages] = useState<Message[]>(repair.messages);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { from: 'customer', text, time: nowTime() }]);
    setDraft('');
  }

  return (
    <section id="messages" aria-labelledby="messages-title" className="glass scroll-mt-24 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="messages-title" className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          <MessageSquare className="h-4 w-4 text-accent" aria-hidden />
          Secure Messages
        </h2>
        <span className="flex items-center gap-1 text-[11px] text-fg3">
          <Lock className="h-3 w-3" aria-hidden />
          With {repair.advisor.name}
        </span>
      </div>

      <ol ref={listRef} aria-live="polite" aria-label="Message thread" className="max-h-[28rem] space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((m, i) => {
          const mine = m.from === 'customer';
          return (
            <li key={i} className={`flex items-end gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && (
                <Photo name={repair.advisor.image} alt="" icon={User} className="h-8 w-8 shrink-0 overflow-hidden rounded-full" />
              )}
              <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? 'text-right' : ''}`}>
                <p className="sr-only">{mine ? 'You' : repair.advisor.name} said:</p>
                <p
                  className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                    mine ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md border border-line bg-surface2 text-fg'
                  }`}
                >
                  {m.text}
                </p>
                <p className="mt-1 px-1 text-[11px] text-fg3">{m.time}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-line p-3 sm:p-4">
        <label htmlFor="message-input" className="sr-only">
          Message to {repair.advisor.name}
        </label>
        <input
          ref={inputRef}
          id="message-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          autoComplete="off"
          maxLength={1000}
          className="input min-w-0 flex-1"
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="btn-ink shrink-0 bg-accent px-4 py-2.5 text-accent-fg shadow-accent/20 disabled:opacity-50">
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <p className="px-5 pb-4 text-[11px] text-fg3 sm:px-6">Messages are a preview and stay in this browser until messaging is connected to the workshop.</p>
    </section>
  );
}
