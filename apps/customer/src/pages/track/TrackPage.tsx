import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Car,
  CheckCircle2,
  ClipboardList,
  FileText,
  Hourglass,
  Info,
  Loader2,
  MessageSquare,
  NotebookPen,
  Search,
} from 'lucide-react';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, PageHero, Pill } from '@/components/ui';
import { findRepairCase } from '@/data/catalog';
import type { RepairCase } from '@/data/catalog';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { committedTotal, contactMatches, MediaGrid, RepairTimeline, StatusPill, TechnicianNotes } from './repairParts';

/**
 * Cases this browser tab has already verified with a matching contact. The
 * contact stays out of the URL (personal data); only the tracking ID is kept
 * in ?id=, so a refresh shows the same result without asking again.
 */
const VERIFIED_KEY = 'ew-track-verified';

function readVerified(): string[] {
  try {
    const raw = sessionStorage.getItem(VERIFIED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function rememberVerified(id: string) {
  try {
    sessionStorage.setItem(VERIFIED_KEY, JSON.stringify([...new Set([...readVerified(), id])]));
  } catch {
    // Storage unavailable (private mode): the result just will not survive a refresh.
  }
}

export function TrackPage() {
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const urlId = params.get('id') ?? '';

  const [trackingId, setTrackingId] = useState(urlId);
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'id' | 'contact' | 'both' | null>(null);
  const [repair, setRepair] = useState<RepairCase | null>(() => {
    const found = urlId ? findRepairCase(urlId) : undefined;
    return found && readVerified().includes(found.trackingId) ? found : null;
  });
  const [checking, setChecking] = useState(false);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);

  // Follow ?id= when it changes (for example from the home page quick-track box).
  useEffect(() => {
    setTrackingId(urlId);
    const found = urlId ? findRepairCase(urlId) : undefined;
    setRepair(found && readVerified().includes(found.trackingId) ? found : null);
  }, [urlId]);

  function onLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    if (!trackingId.trim()) {
      setError('Enter the tracking ID from your drop-off email or text.');
      setErrorField('id');
      idRef.current?.focus();
      return;
    }
    if (!contact.trim()) {
      setError('Enter the email address or phone number you gave us at drop-off.');
      setErrorField('contact');
      contactRef.current?.focus();
      return;
    }
    setChecking(true);
    // A short pause so the result is announced as a fresh update.
    window.setTimeout(() => {
      setChecking(false);
      const found = findRepairCase(trackingId);
      if (!found || !contactMatches(found, contact)) {
        setRepair(null);
        setErrorField('both');
        setError(
          'We could not find a repair with that tracking ID and contact. Check the ID in your drop-off email or text, and use the same email or phone number you gave us.',
        );
        return;
      }
      rememberVerified(found.trackingId);
      setRepair(found);
      setParams({ id: found.trackingId }, { replace: true });
      window.setTimeout(() => resultRef.current?.focus(), 0);
    }, 300);
  }

  const errorId = 'track-error';

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: sitePath(site) }, { label: 'Repair Tracking' }]} />
      <div className="container-site pt-4">
        <div className="overflow-hidden rounded-3xl">
          <PageHero
            align="center"
            title="Track Your Repair"
            subtitle="Enter your tracking ID and contact information to see live status updates, photos and estimates for your vehicle."
          >
            <form
              onSubmit={onLookup}
              noValidate
              className="glass-dark mx-auto grid max-w-3xl gap-3 rounded-2xl p-4 text-left sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5"
            >
              <div>
                <label htmlFor="track-id" className="mb-1.5 block text-xs font-medium text-white/70">
                  Tracking ID <span aria-hidden>*</span>
                </label>
                <input
                  ref={idRef}
                  id="track-id"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="EW-00000-000"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  aria-invalid={errorField === 'id' || errorField === 'both'}
                  aria-describedby={errorField === 'id' || errorField === 'both' ? errorId : undefined}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="track-contact" className="mb-1.5 block text-xs font-medium text-white/70">
                  Email or Phone <span aria-hidden>*</span>
                </label>
                <input
                  ref={contactRef}
                  id="track-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  aria-invalid={errorField === 'contact' || errorField === 'both'}
                  aria-describedby={errorField === 'contact' || errorField === 'both' ? errorId : undefined}
                  className="input"
                />
              </div>
              <button type="submit" disabled={checking} className="btn-ink w-full bg-accent text-accent-fg shadow-accent/30 sm:w-auto">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
                Lookup
              </button>
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-white/60 sm:col-span-3">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Trying it out? Use tracking ID <span className="font-mono font-semibold text-white/85">EW-82734-615</span> with{' '}
                  <span className="font-semibold text-white/85">john.doe@example.com</span>.
                </span>
              </p>
            </form>
          </PageHero>
        </div>
      </div>

      <div aria-live="polite" className="container-site">
        {checking && <p className="sr-only">Looking up your repair.</p>}
        {error && (
          <p id={errorId} className="mx-auto mt-6 flex max-w-3xl items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
        {repair && !error && <p className="sr-only">Repair found: {repair.vehicle}, status {repair.status}.</p>}
      </div>

      {repair ? <RepairResult repair={repair} headingRef={resultRef} /> : <EmptyState />}
    </>
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
        <Link to={sitePath(site, 'book')} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline coarse:min-h-11">
          Book a service <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </p>
    </section>
  );
}

function Card({ title, Icon, aside, children, className = '' }: { title: string; Icon: typeof Car; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl p-5 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3">
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

function RepairResult({ repair, headingRef }: { repair: RepairCase; headingRef: RefObject<HTMLHeadingElement> }) {
  const site = useSite();
  const casePath = sitePath(site, `track/${repair.trackingId}`);
  const total = committedTotal(repair.lineItems);

  return (
    <div className="container-site space-y-6 py-8 sm:py-10">
      <section aria-labelledby="repair-vehicle" className="glass-strong flex flex-col gap-5 rounded-2xl p-4 sm:p-5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Photo name="garage-car" alt={repair.vehicle} icon={Car} className="h-16 w-24 shrink-0 rounded-xl sm:h-20 sm:w-28" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="repair-vehicle" ref={headingRef} tabIndex={-1} className="font-display text-xl font-bold text-fg outline-none sm:text-2xl">
                {repair.vehicle}
              </h2>
              <StatusPill status={repair.status} />
            </div>
            <p className="mt-1 text-xs text-fg3">
              Tracking ID: <span className="font-mono font-semibold text-fg2">{repair.trackingId}</span>
              <span aria-hidden> · </span>
              License: <span className="font-semibold text-fg2">{repair.plate}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to={casePath} className="btn-outline py-2.5">
            <FileText className="h-4 w-4" aria-hidden />
            View Estimate
          </Link>
          <Link to={`${casePath}#messages`} className="btn-ink bg-accent py-2.5 text-accent-fg shadow-accent/20">
            <MessageSquare className="h-4 w-4" aria-hidden />
            Message Advisor
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Repair Status" Icon={ClipboardList} className="lg:row-span-2">
          <RepairTimeline steps={repair.timeline} progress={repair.progress} />
        </Card>

        <Card title="Technician Notes" Icon={NotebookPen} aside={<span className="text-[11px] text-fg3">{repair.notes[repair.notes.length - 1]?.time}</span>}>
          <TechnicianNotes notes={repair.notes} />
        </Card>

        <Card title="Service Summary" Icon={FileText}>
          <ul className="space-y-2">
            {repair.lineItems.map((item) => {
              const pending = item.state === 'needs-approval' || item.state === 'pending';
              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    item.state === 'in-progress' ? 'border-accent/30 bg-accent/5' : 'border-line bg-surface2/50'
                  }`}
                >
                  {item.state === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-label="Completed" />
                  ) : item.state === 'in-progress' ? (
                    <Loader2 className="h-4 w-4 shrink-0 text-accent" aria-label="In progress" />
                  ) : (
                    <Hourglass className="h-4 w-4 shrink-0 text-warn" aria-label="Needs your approval" />
                  )}
                  <span className={`min-w-0 flex-1 ${pending ? 'text-fg3' : item.state === 'in-progress' ? 'font-medium text-accent' : 'text-fg'}`}>
                    {item.title}
                    {pending && (
                      <Pill tone="warn" className="ml-2 align-middle">
                        Approval
                      </Pill>
                    )}
                  </span>
                  <span className={`shrink-0 tabular-nums ${pending ? 'text-fg3' : 'font-semibold text-fg'}`}>{formatMoney(item.price)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-fg2">Current Total</span>
            <span className="font-display text-xl font-bold tabular-nums text-fg">{formatMoney(total)}</span>
          </div>
          {repair.lineItems.some((i) => i.state === 'needs-approval') && (
            <p className="mt-2 text-xs text-fg3">
              Items waiting for approval are not included.{' '}
              <Link to={casePath} className="font-semibold text-accent hover:underline">
                Review them
              </Link>
            </p>
          )}
        </Card>

        <Card
          title="Inspection Photos & Video"
          Icon={Camera}
          className="lg:col-span-2"
          aside={
            <Link to={`${casePath}#photos`} className="inline-flex items-center text-xs font-semibold text-accent hover:underline coarse:min-h-11">
              View all ({repair.media.length})
            </Link>
          }
        >
          <MediaGrid media={repair.media} />
        </Card>
      </div>
    </div>
  );
}
