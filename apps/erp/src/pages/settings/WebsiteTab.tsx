import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, ExternalLink, Globe, Lock, Palette, Rocket, Wrench } from 'lucide-react';
import { SITE_RADII, normalizeSiteSections, normalizeSiteTheme, siteFont } from '@eurowerken/shared';
import type { WorkshopSite } from '@eurowerken/shared';
import { useAuth } from '@/auth/AuthContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { CUSTOMER_SITE_URL } from '@/config/customerSite';
import { supabase } from '@/lib/supabase';
import { WebsiteCard } from './WebsiteCard';
import { CopyButton } from './website/CopyButton';
import { isSetUp, themeName } from './website/siteDraft';

const SETUP = '/settings/website/setup';

/**
 * Settings, Website. A site that was never set up gets "Deploy your website"; a set-up site gets its Design
 * summary above the settings form.
 */
export function WebsiteTab() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const [site, setSite] = useState<WorkshopSite | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    const { data, error: e } = await supabase.from('workshop_sites').select('*').eq('workshop_id', workshopId).maybeSingle();
    if (e) {
      setError(e.message);
      setState('error');
      return;
    }
    setSite((data as WorkshopSite | null) ?? null);
    setState('ready');
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') return <Card className="p-4 text-xs text-fg2 sm:p-5">Loading website settings...</Card>;
  if (state === 'error') return <Card className="p-4 text-xs text-fg2 sm:p-5">Website settings could not be loaded: {error}</Card>;
  // Without a row, or without the design columns (migration 028), the plain settings card explains what is missing.
  if (!site || !('setup_completed_at' in site)) return <WebsiteCard />;

  if (!isSetUp(site)) return <DeployWelcome canEdit={canEdit} />;

  return (
    <div className="space-y-4">
      <DesignPanel site={site} canEdit={canEdit} />
      <WebsiteCard onSaved={setSite} />
    </div>
  );
}

function DeployWelcome({ canEdit }: { canEdit: boolean }) {
  const gives = [
    { icon: CalendarCheck, text: 'Online booking from your opening hours, straight into Appointments.' },
    { icon: Wrench, text: 'Repair tracking with photos, messages and online approvals.' },
    { icon: Lock, text: 'My Garage: customer accounts with their cars, history and invoices.' },
    { icon: Palette, text: 'Your name, colours, photo and services, in a design you choose.' },
  ];
  return (
    <Card className="p-5 sm:p-7">
      <Globe className="h-7 w-7 text-accent" aria-hidden />
      <h2 className="mt-3 font-display text-base font-semibold text-fg">Your customer website isn't live yet</h2>
      <p className="mt-1 max-w-xl text-xs text-fg2">
        Set it up in a few minutes. You choose the address, the style and what the home page shows, with a live preview of
        the real site as you go.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {gives.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 rounded-lg border border-line bg-surface2 p-3 text-xs text-fg">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {canEdit ? (
          <Link
            to={SETUP}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 coarse:min-h-11"
          >
            <Rocket className="h-4 w-4" aria-hidden />
            Deploy your website
          </Link>
        ) : (
          <p className="text-xs text-fg3">Ask a manager to set it up.</p>
        )}
      </div>
    </Card>
  );
}

function DesignPanel({ site, canEdit }: { site: WorkshopSite; canEdit: boolean }) {
  const theme = normalizeSiteTheme(site.theme);
  const sections = normalizeSiteSections(site.sections);
  const on = sections.filter((s) => s.enabled).length;
  const url = `${CUSTOMER_SITE_URL}/${site.slug}`;
  const facts: [string, string][] = [
    ['Font', siteFont(theme.font).label],
    ['Corners', SITE_RADII.find((r) => r.id === theme.radius)?.label ?? theme.radius],
    ['Mode', theme.mode === 'dark' ? 'Dark' : 'Light'],
    ['Layout', site.nav_style === 'classic' ? 'Classic header menu' : 'Liquid glass tab bar'],
    ['Home page', `Hero and ${on} of ${sections.length} sections`],
  ];
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Design" subtitle="How your customer website looks." />
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-9 w-9 shrink-0 rounded-lg border border-black/10" style={{ background: site.accent_color }} aria-hidden />
        <div>
          <p className="text-xs font-semibold text-fg">{themeName(theme)}</p>
          <p className="font-mono text-[11px] text-fg3">{site.accent_color}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-fg3">{k}</dt>
            <dd className="text-xs text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canEdit && (
          <Link
            to={`${SETUP}?step=style`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 coarse:min-h-11"
          >
            <Palette className="h-3.5 w-3.5" aria-hidden />
            Change design
          </Link>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-fg2 hover:bg-surface2 hover:text-fg coarse:min-h-11"
        >
          Preview <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-[11px] text-fg3">Live address</span>
        <span className="min-w-0 break-all font-mono text-xs text-fg">{url}</span>
        <CopyButton text={url} />
      </div>
    </Card>
  );
}
