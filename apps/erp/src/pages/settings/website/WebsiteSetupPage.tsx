import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Eye, EyeOff, Loader2, PartyPopper, Rocket } from 'lucide-react';
import type { ServiceRow, TeamMemberRow, WorkshopSite } from '@eurowerken/shared';
import { listServices, listTeamMembers } from '@/api/catalogue';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CUSTOMER_SITE_URL } from '@/config/customerSite';
import { supabase } from '@/lib/supabase';
import { ErrorNote } from '../../inventory/PartForm';
import { CopyButton } from './CopyButton';
import { SitePreview } from './SitePreview';
import {
  AddressStep,
  ContentStep,
  HomeStep,
  LayoutStep,
  ReviewStep,
  STEPS,
  StyleStep,
  WelcomeStep,
} from './SetupSteps';
import type { StepId } from './SetupSteps';
import {
  addressErrors,
  contentErrors,
  deploySite,
  draftKey,
  friendlySaveError,
  isSetUp,
  ownSitePath,
  removeSiteFile,
  saveDraft,
  saveSitePatch,
  styleErrors,
  toDraft,
  uploadSiteImage,
} from './siteDraft';
import type { SiteDraft, SiteImageKind } from './siteDraft';

function errorsFor(step: StepId, d: SiteDraft): string[] {
  if (step === 'address') return addressErrors(d);
  if (step === 'style') return styleErrors(d);
  if (step === 'content') return contentErrors(d);
  return [];
}

const indexOf = (id: string | null) => STEPS.findIndex((s) => s.id === id);
const resumeKey = (workshopId: string) => `ew-site-setup:${workshopId}`;

function readResume(workshopId: string): { step: number; max: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(resumeKey(workshopId)) ?? 'null') as { step?: unknown; max?: unknown } | null;
    if (!raw) return null;
    const step = Number(raw.step);
    const max = Number(raw.max);
    if (!Number.isInteger(step) || !Number.isInteger(max)) return null;
    return { step: Math.min(Math.max(step, 0), STEPS.length - 1), max: Math.min(Math.max(max, step), STEPS.length - 1) };
  } catch {
    return null;
  }
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error' };

/** Settings, Website, "Deploy your website": a full-page setup with a live preview of the real customer site. */
export function WebsiteSetupPage() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [saved, setSaved] = useState<WorkshopSite | null>(null);
  const [draft, setDraft] = useState<SiteDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [team, setTeam] = useState<TeamMemberRow[]>([]);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [deploying, setDeploying] = useState(false);
  const [done, setDone] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState<SiteImageKind | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set when the user moves to another step, so the new step's heading gets focus.
  const focusHeading = useRef(false);

  // Load the site, then the services and team the preview shows.
  useEffect(() => {
    if (!workshopId) return;
    let alive = true;
    void supabase
      .from('workshop_sites')
      .select('*')
      .eq('workshop_id', workshopId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) return setLoadError(friendlySaveError(error.message));
        if (!data) return setLoadError('No website yet. Apply database migration 004 (npm run db:migrate).');
        const row = data as WorkshopSite;
        if (!('theme' in row)) return setLoadError(friendlySaveError('column theme does not exist'));
        setSaved(row);
        setDraft(toDraft(row));
        const asked = indexOf(params.get('step'));
        const resume = isSetUp(row) ? null : readResume(workshopId);
        const start = asked >= 0 ? asked : (resume?.step ?? 0);
        setStep(start);
        setMaxStep(isSetUp(row) ? STEPS.length - 1 : Math.max(start, resume?.max ?? 0));
      });
    listServices(workshopId)
      .then((rows) => alive && setServices(rows.filter((s) => s.active)))
      .catch(() => undefined);
    listTeamMembers(workshopId)
      .then((rows) => alive && setTeam(rows.filter((m) => m.is_public)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // The start step is read once, on load, not again when the address changes.
  }, [workshopId]);

  // Focus the step's heading after the user changes step (not on first load).
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [step, done]);

  // Remember where a first-time setup was, so leaving and coming back resumes there.
  useEffect(() => {
    if (!workshopId || !saved || isSetUp(saved) || done) return;
    try {
      localStorage.setItem(resumeKey(workshopId), JSON.stringify({ step, max: maxStep }));
    } catch {
      // Private mode: no resume, the saved draft is still there.
    }
  }, [workshopId, saved, step, maxStep, done]);

  const dirty = useMemo(() => (draft && saved ? draftKey(draft) !== draftKey(toDraft(saved)) : false), [draft, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = useCallback((patch: Partial<SiteDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSave((s) => (s.kind === 'saved' ? { kind: 'idle' } : s));
  }, []);

  /** Errors anywhere in the draft, named by step (the current step's without a prefix). */
  function blockingErrors(d: SiteDraft, current: StepId): string[] {
    const out = errorsFor(current, d);
    for (const s of STEPS) {
      if (s.id === current) continue;
      for (const e of errorsFor(s.id, d)) out.push(`${s.title}: ${e}`);
    }
    return out;
  }

  /** The site is public: changes stay in this setup (and its preview) until Save changes. */
  const live = Boolean(saved && isSetUp(saved) && saved.published);

  async function persist(): Promise<boolean> {
    if (!draft || !workshopId) return false;
    if (!dirty || live) return true;
    setSave({ kind: 'saving' });
    try {
      const row = await saveDraft(workshopId, draft);
      setSaved(row);
      setSave({ kind: 'saved' });
      return true;
    } catch (e) {
      setSave({ kind: 'error' });
      setErrors([e instanceof Error ? e.message : 'Your changes could not be saved.']);
      return false;
    }
  }

  async function goTo(target: number) {
    if (!draft || target === step || target < 0 || target >= STEPS.length) return;
    const current = STEPS[step].id;
    const problems = blockingErrors(draft, current);
    if (problems.length) {
      if (target > step) {
        setErrors(problems);
        return;
      }
      // Going back is always allowed; the draft stays in memory, saved once it is valid again.
      setErrors([]);
      focusHeading.current = true;
      setStep(target);
      return;
    }
    setErrors([]);
    const ok = await persist();
    if (!ok && target > step) return;
    focusHeading.current = true;
    setStep(target);
    setMaxStep((m) => Math.max(m, target));
  }

  async function onDeploy() {
    if (!draft || !workshopId) return;
    const problems = blockingErrors(draft, 'review');
    if (problems.length) return setErrors(problems);
    setErrors([]);
    setDeploying(true);
    setSave({ kind: 'saving' });
    try {
      // First time: publish and mark the setup done. Later: save the design, leave Published as it is.
      const row = isSetUp(saved) ? await saveDraft(workshopId, draft) : await deploySite(workshopId, draft);
      setSaved(row);
      setDraft(toDraft(row));
      setSave({ kind: 'saved' });
      try {
        localStorage.removeItem(resumeKey(workshopId));
      } catch {
        // Nothing to clear.
      }
      focusHeading.current = true;
      setDone(true);
    } catch (e) {
      setSave({ kind: 'error' });
      setErrors([e instanceof Error ? e.message : 'The website could not be deployed.']);
    } finally {
      setDeploying(false);
    }
  }

  async function onImage(kind: SiteImageKind, file: File) {
    if (!workshopId || !draft) return;
    const col = kind === 'hero' ? 'hero_image_url' : 'logo_url';
    setUploading(kind);
    setImageError(null);
    let url: string | null = null;
    try {
      url = await uploadSiteImage(file, kind, workshopId);
      const old = ownSitePath(draft[col] as string | null, workshopId);
      if (live) {
        // Shown in the preview now; the public site gets it with Save changes.
        update({ [col]: url } as Partial<SiteDraft>);
      } else {
        const row = await saveSitePatch(workshopId, { [col]: url });
        setSaved(row);
        update({ [col]: url } as Partial<SiteDraft>);
        removeSiteFile(old);
      }
    } catch (e) {
      if (url) removeSiteFile(ownSitePath(url, workshopId));
      setImageError(e instanceof Error ? e.message : 'The picture could not be uploaded.');
    } finally {
      setUploading(null);
    }
  }

  async function onRemoveImage(kind: SiteImageKind) {
    if (!workshopId || !draft) return;
    const col = kind === 'hero' ? 'hero_image_url' : 'logo_url';
    setUploading(kind);
    setImageError(null);
    try {
      const old = ownSitePath(draft[col] as string | null, workshopId);
      if (live) {
        update({ [col]: null } as Partial<SiteDraft>);
      } else {
        const row = await saveSitePatch(workshopId, { [col]: null });
        setSaved(row);
        update({ [col]: null } as Partial<SiteDraft>);
        removeSiteFile(old);
      }
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'The picture could not be removed.');
    } finally {
      setUploading(null);
    }
  }

  if (!canEdit) {
    return (
      <Card className="mx-auto max-w-xl p-5 text-xs text-fg2">
        <h1 className="font-display text-sm font-semibold text-fg">Deploy your website</h1>
        <p className="mt-2">Only staff with full access to Settings can set up the website. Ask a manager to set it up.</p>
        <Link to="/settings" className="mt-3 inline-block font-medium text-accent hover:underline">
          Back to settings
        </Link>
      </Card>
    );
  }
  if (loadError) {
    return (
      <Card className="mx-auto max-w-xl p-5 text-xs text-fg2">
        <p role="alert">The website could not be loaded: {loadError}</p>
        <Link to="/settings" className="mt-3 inline-block font-medium text-accent hover:underline">
          Back to settings
        </Link>
      </Card>
    );
  }
  if (!draft || !saved) {
    return (
      <p className="flex items-center gap-2 text-xs text-fg2" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your website...
      </p>
    );
  }

  const siteUrl = `${CUSTOMER_SITE_URL}/${saved.slug}`;
  const wasSetUp = isSetUp(saved) && !done;

  if (done) return <Success heading={headingRef} url={siteUrl} live={saved.published} onBack={() => navigate('/settings')} />;

  const current = STEPS[step];
  const reachable = (i: number) => i <= maxStep || wasSetUp;
  const last = step === STEPS.length - 1;

  const statusText =
    save.kind === 'saving' ? 'Saving...' : save.kind === 'saved' ? 'All changes saved.' : save.kind === 'error' ? 'Not saved.' : dirty ? 'Unsaved changes.' : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/settings" className="inline-flex items-center gap-1 text-xs text-fg2 hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Settings
          </Link>
          <h1 className="font-display text-base font-semibold text-fg">{wasSetUp ? 'Change your website' : 'Deploy your website'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-fg3" role="status" aria-live="polite">
            {live && !done ? (dirty ? 'Not saved yet: your live site changes when you press Save changes.' : 'Your site is live. Changes show in the preview until you save.') : statusText}
          </span>
          <Button variant="ghost" className="xl:hidden" aria-pressed={showPreview} onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {showPreview ? 'Hide preview' : 'Preview'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)] xl:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Stepper: a column on wide screens, a scrolling row on phones. */}
        <nav aria-label="Setup steps" className="min-w-0">
          <ol className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {STEPS.map((s, i) => {
              const active = i === step;
              const visited = i < step || (i <= maxStep && !active);
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    disabled={!reachable(i)}
                    aria-current={active ? 'step' : undefined}
                    onClick={() => void goTo(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50 coarse:min-h-11 ${
                      active ? 'bg-accent/10 font-semibold text-fg' : 'text-fg2 hover:bg-surface2 hover:text-fg'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                        active ? 'bg-accent text-white' : visited ? 'bg-ok/20 text-ok' : 'bg-fg3/15 text-fg3'
                      }`}
                    >
                      {visited && !active ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap lg:whitespace-normal">
                      <span className="lg:hidden">{s.short}</span>
                      <span className="hidden lg:inline">{s.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card className={`min-w-0 p-4 sm:p-5 ${showPreview ? 'hidden xl:block' : ''}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (last) void onDeploy();
              else void goTo(step + 1);
            }}
            noValidate
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg3">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 ref={headingRef} tabIndex={-1} className="mb-4 font-display text-sm font-semibold text-fg outline-none">
              {current.title}
            </h2>

            {current.id === 'welcome' && <WelcomeStep />}
            {current.id === 'address' && <AddressStep draft={draft} update={update} />}
            {current.id === 'style' && <StyleStep draft={draft} update={update} />}
            {current.id === 'layout' && <LayoutStep draft={draft} update={update} />}
            {current.id === 'home' && <HomeStep draft={draft} update={update} />}
            {current.id === 'content' && (
              <ContentStep
                draft={draft}
                update={update}
                uploading={uploading}
                imageError={imageError}
                onImage={(k, f) => void onImage(k, f)}
                onRemoveImage={(k) => void onRemoveImage(k)}
              />
            )}
            {current.id === 'review' && (
              <div className="space-y-3">
                <p className="text-xs text-fg2">
                  {wasSetUp
                    ? 'Check your changes, then press Save changes. Your live website updates straight away.'
                    : 'Check your choices. Deploy website saves them and makes your website public.'}
                </p>
                <ReviewStep draft={draft} onEdit={(id) => void goTo(indexOf(id))} />
              </div>
            )}

            <div className="mt-4">
              <ErrorNote errors={errors.length ? errors : null} />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Button variant="ghost" disabled={step === 0 || save.kind === 'saving'} onClick={() => void goTo(step - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
              </Button>
              {last ? (
                <Button type="submit" disabled={deploying || uploading !== null}>
                  {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Rocket className="h-3.5 w-3.5" aria-hidden />}
                  {deploying ? (wasSetUp ? 'Saving...' : 'Deploying...') : wasSetUp ? 'Save changes' : 'Deploy website'}
                </Button>
              ) : (
                <Button type="submit" disabled={save.kind === 'saving' || uploading !== null}>
                  {save.kind === 'saving' ? 'Saving...' : 'Next'} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
          </form>
        </Card>

        <section
          aria-label="Live preview"
          className={`min-w-0 lg:col-start-2 xl:col-start-auto ${showPreview ? 'block' : 'hidden xl:block'}`}
        >
          <Card className="p-3 xl:sticky xl:top-0">
            <SitePreview draft={draft} services={services} team={team} />
          </Card>
        </section>
      </div>
    </div>
  );
}

function Success({ heading, url, live, onBack }: { heading: RefObject<HTMLHeadingElement>; url: string; live: boolean; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="mx-auto max-w-xl p-6 text-center sm:p-8">
      <PartyPopper className="mx-auto h-8 w-8 text-accent" aria-hidden />
      <h1 ref={heading} tabIndex={-1} className="mt-3 font-display text-lg font-semibold text-fg outline-none">
        {live ? 'Your website is live' : 'Your changes are saved'}
      </h1>
      <p className="mt-1 text-xs text-fg2">
        {live
          ? 'Customers can book, track repairs and sign in at:'
          : 'Your website is not published. Turn on Published in Settings, Website to make it public at:'}
      </p>
      <p className="mt-3 break-all rounded-lg border border-line bg-surface2 px-3 py-2 font-mono text-xs text-fg">{url}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <CopyButton text={url} onCopied={() => setCopied(true)} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 coarse:min-h-11"
        >
          Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <Button variant="ghost" onClick={onBack}>
          Back to settings
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ok" role="status" aria-live="polite">
        {copied ? 'Address copied.' : ''}
      </p>
    </Card>
  );
}
