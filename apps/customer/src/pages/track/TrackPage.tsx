import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Camera, Car, CheckCircle2, ChevronDown, ClipboardList, FileText, MessageSquare, NotebookPen, RotateCcw, Search, User, Wrench } from 'lucide-react';
import { ACTIVE_STATUSES, STATUS_LABEL, listMyRepairs, useTrackedRepair, vehicleName } from '@/api/repairs';
import type { MyRepair, TrackedRepair } from '@/api/repairs';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, PageHero } from '@/components/ui';
import { sitePath, useSite } from '@/site/SiteContext';
import {
  ItemsSummary,
  LookupForm,
  ProgressBar,
  MediaGrid,
  RepairTimeline,
  StaleNote,
  StatusPill,
  TechnicianCard,
  Totals,
  WorkshopUpdates,
  formatDay,
  repairTimeZone,
  useRepairContact,
} from './repairUi';

/**
 * Repair Tracking. The tracking ID is kept in ?id=; the contact only in
 * sessionStorage for this tab (never in the URL), so a refresh shows the same
 * result without asking again. Signed-in customers see their repairs at this
 * workshop first (active, then recently completed), each opening its case page;
 * the code form is a secondary "Track another repair" toggle for them.
 */
export function TrackPage() {
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const urlId = (params.get('id') ?? '').trim().toUpperCase();
  const access = useRepairContact(urlId || null);
  const tracked = useTrackedRepair(urlId || null, access.ready ? access.contact : null);
  const [formError, setFormError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const focusResult = useRef(false);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    document.title = `Repair Tracking | ${site.display_name}`;
  }, [site.display_name]);

  // The stored or account contact was refused: forget it and show the form (with the message, unless it was automatic).
  const { error } = tracked;
  const { contact, fromAccount, reject } = access;
  useEffect(() => {
    if (!error || !contact) return;
    setFormError(fromAccount ? null : error);
    reject();
  }, [error, contact, fromAccount, reject]);

  // Focus the result after a lookup, and announce status changes that arrive later.
  const data = tracked.data;
  useEffect(() => {
    if (!data) {
      lastStatus.current = null;
      return;
    }
    if (focusResult.current) {
      focusResult.current = false;
      setAnnounce(`Repair found: ${vehicleName(data.repair.vehicle)}, ${STATUS_LABEL[data.repair.status]}.`);
      requestAnimationFrame(() => resultRef.current?.focus());
    } else if (lastStatus.current && lastStatus.current !== data.repair.status) {
      setAnnounce(`Status updated: ${STATUS_LABEL[data.repair.status]}.`);
    }
    lastStatus.current = data.repair.status;
  }, [data]);

  function onFound(code: string, typed: string) {
    setFormError(null);
    focusResult.current = true;
    if (code === urlId) access.setTyped(typed);
    else setParams({ id: code }, { replace: false });
  }

  const showLoading = Boolean(urlId && access.contact && tracked.loading && !data) || (Boolean(urlId) && !access.ready);
  const { status: authStatus, account } = useCustomerAuth();
  const signedInId = authStatus === 'signed-in' ? (account?.id ?? null) : null;

  const result = showLoading ? (
    <div aria-busy="true" className="container-site py-8 sm:py-10">
      <p className="sr-only" role="status">
        Loading your repair
      </p>
      <div aria-hidden className="space-y-6">
        <div className="glass h-28 animate-pulse rounded-2xl motion-reduce:animate-none" />
        <div className="grid gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass h-56 animate-pulse rounded-2xl motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    </div>
  ) : data ? (
    <RepairResult tracked={data} stale={tracked.stale} onRetry={() => void tracked.refresh()} headingRef={resultRef} />
  ) : null;

  if (authStatus === 'loading') {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Repair Tracking' }]} />
        <div aria-busy="true" className="container-site py-6 sm:py-8">
          <p className="sr-only" role="status">
            Loading
          </p>
          <div aria-hidden className="glass-strong h-40 animate-pulse rounded-3xl motion-reduce:animate-none" />
        </div>
      </>
    );
  }

  if (signedInId) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Repair Tracking' }]} />
        <MyRepairs accountId={signedInId} lookupOpenAtStart={Boolean(urlId || formError)}>
          <LookupForm initialCode={urlId} initialError={formError} onFound={onFound} />
        </MyRepairs>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        {result}
      </>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Repair Tracking' }]} />
      <div className="container-site pt-4">
        <div className="overflow-hidden rounded-3xl">
          <PageHero
            align="center"
            title="Track Your Repair"
            subtitle="Enter your tracking ID and the email or phone you booked with to see live status updates, photos and estimates for your vehicle."
          >
            <LookupForm tone="hero" initialCode={urlId} initialError={formError} onFound={onFound} />
          </PageHero>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {result ?? <EmptyState />}
    </>
  );
}

/** How many completed repairs to show under the active ones. */
const RECENT_COMPLETED = 4;

type MyRepairsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; active: MyRepair[]; completed: MyRepair[] };

/**
 * Signed-in customers: their repairs at this workshop (RLS returns only their
 * own), active first, then recently completed. Each card opens the case page,
 * where they can approve straight away. The code form sits behind a toggle.
 */
function MyRepairs({ accountId, lookupOpenAtStart, children }: { accountId: string; lookupOpenAtStart: boolean; children: ReactNode }) {
  const site = useSite();
  const [state, setState] = useState<MyRepairsState>({ status: 'loading' });
  const [lookupOpen, setLookupOpen] = useState(lookupOpenAtStart);
  const lookupId = useId();

  useEffect(() => {
    if (lookupOpenAtStart) setLookupOpen(true);
  }, [lookupOpenAtStart]);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const { data, error } = await listMyRepairs(accountId, site.workshop_id);
    if (error !== null) {
      setState({ status: 'error', message: error });
      return;
    }
    setState({
      status: 'ready',
      active: data.filter((r) => ACTIVE_STATUSES.includes(r.status)),
      completed: data.filter((r) => r.status === 'completed').slice(0, RECENT_COMPLETED),
    });
  }, [accountId, site.workshop_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const none = state.status === 'ready' && state.active.length === 0 && state.completed.length === 0;

  return (
    <div className="container-site space-y-6 pt-4">
      <section aria-labelledby="my-repairs-title" className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <p className="eyebrow">Repair Tracking</p>
          <h1 id="my-repairs-title" className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Your repairs
          </h1>
          <p className="mt-2 text-sm text-fg2">Live status, estimates and messages for your vehicles at {site.display_name}.</p>
        </div>
      </section>

      {state.status === 'loading' && (
        <div aria-busy="true">
          <p className="sr-only" role="status">
            Loading your repairs
          </p>
          <div aria-hidden className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="glass h-36 animate-pulse rounded-2xl motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="glass rounded-2xl border-l-4 border-l-bad p-5">
          <p className="font-semibold text-fg">We could not load your repairs.</p>
          <p className="mt-1 text-sm text-fg2">{state.message}</p>
          <button type="button" onClick={() => void load()} className="btn-outline mt-4 min-h-11">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

      {none && (
        <div className="glass rounded-2xl p-6 text-center sm:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Wrench className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-3 font-display text-lg font-semibold text-fg">No repairs yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg2">
            When your vehicle is checked in at {site.display_name}, it shows up here with live updates. Booked as a guest? Track it with the code below.
          </p>
          <Link to={sitePath(site, 'book')} className="btn-ink mt-5 min-h-11 bg-accent px-5 py-2.5 text-accent-fg shadow-accent/20">
            Book a service <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}

      {state.status === 'ready' && state.active.length > 0 && <RepairCards title="In the workshop" list={state.active} />}
      {state.status === 'ready' && state.completed.length > 0 && <RepairCards title="Recently completed" list={state.completed} />}

      <section aria-label="Track another repair">
        <button
          type="button"
          aria-expanded={lookupOpen}
          aria-controls={lookupId}
          onClick={() => setLookupOpen((o) => !o)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-accent hover:underline"
        >
          <Search className="h-4 w-4" aria-hidden />
          Track another repair with a code
          <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${lookupOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div id={lookupId} hidden={!lookupOpen} className="mt-3">
          {lookupOpen && children}
        </div>
      </section>
    </div>
  );
}

function RepairCards({ title, list }: { title: string; list: MyRepair[] }) {
  const site = useSite();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-xl font-semibold text-fg">
        {title}
      </h2>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {list.map((r) => {
          const name = vehicleName(r.vehicle);
          const done = r.status === 'completed';
          return (
            <li key={r.id} className="glass flex flex-col gap-4 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent'}`}>
                    {done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Wrench className="h-5 w-5" aria-hidden />}
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
                <StatusPill status={r.status} />
              </div>
              {!done && <ProgressBar status={r.status} label={`Progress of ${name}`} />}
              <Link
                to={sitePath(site, `track/${encodeURIComponent(r.tracking_code)}`)}
                aria-label={`${r.status === 'awaiting_approval' ? 'Review the estimate for' : 'Open'} repair ${r.number}, ${name}`}
                className={
                  r.status === 'awaiting_approval'
                    ? 'btn-ink min-h-11 self-start bg-accent py-2.5 text-accent-fg shadow-accent/20'
                    : 'btn-outline min-h-11 self-start py-2.5'
                }
              >
                <FileText className="h-4 w-4" aria-hidden />
                {r.status === 'awaiting_approval' ? 'Review estimate' : 'Open repair'}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmptyState() {
  const site = useSite();
  return (
    <section className="container-site py-14 sm:py-20">
      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
        {[
          { Icon: ClipboardList, title: 'Live status', text: 'See each step from check-in to pickup as it happens.' },
          { Icon: Camera, title: 'Photos and video', text: 'View what the technician found, with photos of worn parts.' },
          { Icon: FileText, title: 'Clear estimates', text: 'Every line item and price before any extra work is done.' },
        ].map(({ Icon, title, text }) => (
          <div key={title} className="glass rounded-2xl p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-3 font-display font-semibold text-fg">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-fg2">{text}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-fg2">
        No tracking ID yet?{' '}
        <Link to={sitePath(site, 'book')} className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent hover:underline">
          Book a service <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </p>
    </section>
  );
}

function Card({ title, Icon, aside, children, className = '' }: { title: string; Icon: typeof Car; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass min-w-0 rounded-2xl p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function RepairResult({
  tracked,
  stale,
  onRetry,
  headingRef,
}: {
  tracked: TrackedRepair;
  stale: boolean;
  onRetry: () => void;
  headingRef: RefObject<HTMLHeadingElement>;
}) {
  const site = useSite();
  const { repair, items, events, media } = tracked;
  const tz = repairTimeZone(repair);
  const casePath = sitePath(site, `track/${encodeURIComponent(repair.tracking_code)}`);
  const name = vehicleName(repair.vehicle);
  const pending = items.some((i) => i.approval === 'pending');

  return (
    <div className="container-site space-y-6 py-8 sm:py-10">
      {stale && <StaleNote onRetry={onRetry} />}
      <section aria-labelledby="repair-vehicle" className="glass-strong flex flex-col gap-5 rounded-2xl p-4 sm:p-5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Photo name="garage-car" alt="" icon={Car} className="hidden h-16 w-24 shrink-0 rounded-xl min-[420px]:block sm:h-20 sm:w-28" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="repair-vehicle" ref={headingRef} tabIndex={-1} className="break-words font-display text-xl font-bold text-fg outline-none sm:text-2xl">
                {name}
              </h2>
              <StatusPill status={repair.status} />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-fg3">
              <span>
                Tracking ID: <span className="font-mono font-semibold text-fg2">{repair.tracking_code}</span>
              </span>
              <span>
                Work order: <span className="font-semibold text-fg2">{repair.number}</span>
              </span>
              {repair.vehicle.plate && (
                <span>
                  Plate: <span className="font-semibold text-fg2">{repair.vehicle.plate}</span>
                </span>
              )}
              <span>Checked in {formatDay(repair.created_at, tz)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to={casePath} className="btn-outline min-h-11 py-2.5">
            <FileText className="h-4 w-4" aria-hidden />
            {pending ? 'Review estimate' : 'Open case'}
          </Link>
          <Link to={`${casePath}#messages`} className="btn-ink min-h-11 bg-accent py-2.5 text-accent-fg shadow-accent/20">
            <MessageSquare className="h-4 w-4" aria-hidden />
            Message the workshop
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Repair Status" Icon={ClipboardList} className="lg:row-span-2">
          <RepairTimeline tracked={tracked} />
        </Card>

        <Card title="Your Technician" Icon={User}>
          <TechnicianCard technician={repair.technician} />
        </Card>

        <Card title="Service Summary" Icon={FileText}>
          <ItemsSummary items={items} />
          <Totals items={items} />
          {pending && (
            <Link to={casePath} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:underline">
              Review and approve <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </Card>

        <Card title="Technician Notes" Icon={NotebookPen} className="lg:col-span-2">
          <WorkshopUpdates events={events} timeZone={tz} limit={3} />
        </Card>

        <Card
          title="Inspection Photos & Video"
          Icon={Camera}
          className="lg:col-span-3"
          aside={
            media.length > 0 ? (
              <Link to={`${casePath}#photos`} className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:underline">
                View all ({media.length})
              </Link>
            ) : undefined
          }
        >
          <MediaGrid media={media} limit={8} />
        </Card>
      </div>
    </div>
  );
}
