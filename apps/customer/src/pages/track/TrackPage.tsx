import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Camera, Car, ClipboardList, FileText, MessageSquare, NotebookPen, User, Wrench } from 'lucide-react';
import { STATUS_LABEL, listMyRepairs, useTrackedRepair, vehicleName } from '@/api/repairs';
import type { MyRepair, TrackedRepair } from '@/api/repairs';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, PageHero } from '@/components/ui';
import { sitePath, useSite } from '@/site/SiteContext';
import {
  ItemsSummary,
  LookupForm,
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
 * result without asking again. Signed-in customers open their own repairs
 * without typing anything.
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

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Repair Tracking' }]} />
      <MyRepairsList activeCode={data?.repair.tracking_code ?? null} />
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

      {showLoading ? (
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
      ) : (
        <EmptyState />
      )}
    </>
  );
}

/** Signed-in customers: their repairs at this workshop, opened without typing the contact. */
function MyRepairsList({ activeCode }: { activeCode: string | null }) {
  const site = useSite();
  const { status, account } = useCustomerAuth();
  const [list, setList] = useState<MyRepair[] | null>(null);
  const accountId = status === 'signed-in' ? (account?.id ?? null) : null;

  useEffect(() => {
    if (!accountId) {
      setList(null);
      return;
    }
    let cancelled = false;
    void listMyRepairs(accountId, site.workshop_id).then((res) => {
      if (!cancelled) setList(res.error === null ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, site.workshop_id]);

  if (!list || list.length === 0) return null;
  return (
    <section aria-labelledby="my-repairs-title" className="container-site pt-4">
      <div className="glass rounded-2xl p-4 sm:p-5">
        <h2 id="my-repairs-title" className="flex items-center gap-2 font-display text-base font-semibold text-fg">
          <Wrench className="h-4 w-4 text-accent" aria-hidden />
          Your repairs
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {list.map((r) => {
            const active = r.tracking_code === activeCode;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-fg">{vehicleName(r.vehicle)}</p>
                  <p className="text-xs text-fg3">
                    {r.number}
                    <span aria-hidden> · </span>
                    <span className="font-mono">{r.tracking_code}</span>
                  </p>
                </div>
                <StatusPill status={r.status} />
                <Link
                  to={`${sitePath(site, 'track')}?id=${encodeURIComponent(r.tracking_code)}`}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`Open ${r.number}, ${vehicleName(r.vehicle)}`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-accent hover:bg-accent/10"
                >
                  {active ? 'Open now' : 'Open'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
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
