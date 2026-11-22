import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { DEFAULT_ACCENT, SLUG_PATTERN, hexToRgbTriplet } from '@eurowerken/shared';
import type { WorkshopSite } from '@eurowerken/shared';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

const CUSTOMER_SITE_URL = (import.meta.env.VITE_CUSTOMER_SITE_URL as string | undefined) ?? 'http://localhost:5175';

const inputClass =
  'w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-xs text-fg outline-none placeholder:text-fg3 focus:border-accent coarse:min-h-11';

function Labeled({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg2">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-fg3">{hint}</p>}
    </div>
  );
}

type Draft = Omit<WorkshopSite, 'workshop_id' | 'updated_at'>;

const TEXT_FIELDS: { key: keyof Draft; label: string; placeholder?: string; hint?: string; type?: string }[] = [
  { key: 'tagline', label: 'Tagline', placeholder: 'Premium European Auto Care' },
  { key: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 123-4567' },
  { key: 'email', label: 'Contact email', type: 'email', placeholder: 'service@example.com' },
  { key: 'address', label: 'Address', placeholder: '1234 Autobahn Drive, Calgary, AB' },
  { key: 'logo_url', label: 'Logo URL', placeholder: 'https://...', hint: 'Optional. A square image works best. Starts with https://' },
  { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/...' },
  { key: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/...' },
];

/**
 * The workshop's public customer website: address, name, colours, hero text
 * and contact details. Only full Settings access can save (enforced by RLS).
 */
export function WebsiteCard() {
  const { user, can } = useAuth();
  const canEdit = can('settings', 'full');
  const [site, setSite] = useState<WorkshopSite | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.workshop) return;
    void supabase
      .from('workshop_sites')
      .select('*')
      .eq('workshop_id', user.workshop.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) {
          setError(err.message);
          return;
        }
        if (data) {
          const row = data as WorkshopSite;
          setSite(row);
          const { workshop_id: _w, updated_at: _u, ...rest } = row;
          setDraft(rest);
        }
      });
  }, [user?.workshop]);

  if (loading) return <Card className="p-4 text-xs text-fg2 sm:p-5">Loading website settings...</Card>;
  if (!draft || !site) {
    return (
      <Card className="p-4 text-xs text-fg2 sm:p-5">
        {error
          ? `Website settings could not be loaded: ${error}`
          : 'No website yet. Apply database migration 004 (npm run db:migrate).'}
      </Card>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setSaved(false);
  };

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!draft || !site) return;
    setError(null);
    const slug = draft.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      setError('Web address: 3 to 48 lowercase letters, digits or hyphens, not starting or ending with a hyphen.');
      return;
    }
    if (!hexToRgbTriplet(draft.accent_color)) {
      setError('Brand colour must look like #1d6ff0.');
      return;
    }
    setBusy(true);
    // Empty text fields are stored as null.
    const payload = Object.fromEntries(
      Object.entries({ ...draft, slug }).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
    );
    const { data, error: err } = await supabase
      .from('workshop_sites')
      .update(payload)
      .eq('workshop_id', site.workshop_id)
      .select('*')
      .single();
    setBusy(false);
    if (err) {
      setError(/duplicate key/.test(err.message) ? 'That web address is taken. Choose another.' : err.message);
      return;
    }
    setSite(data as WorkshopSite);
    setSaved(true);
  }

  const siteUrl = `${CUSTOMER_SITE_URL}/${site.slug}`;

  return (
    <form onSubmit={onSave}>
      <Card className="p-4 sm:p-5">
        <CardHeader
          title="Customer website"
          subtitle="Your public site where customers book, track repairs and shop parts. Your branding, made with EuroWerken."
          action={
            <Badge tone={site.published ? 'ok' : 'neutral'}>{site.published ? 'Published' : 'Not published'}</Badge>
          }
        />

        <fieldset disabled={!canEdit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled id="site-name" label="Name on the website">
              <input
                id="site-name"
                className={inputClass}
                maxLength={60}
                required
                value={draft.display_name}
                onChange={(e) => set('display_name', e.target.value)}
              />
            </Labeled>
            <Labeled id="site-slug" label="Web address" hint={`${CUSTOMER_SITE_URL.replace(/^https?:\/\//, '')}/${draft.slug || '...'}`}>
              <input
                id="site-slug"
                className={inputClass}
                maxLength={48}
                required
                value={draft.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              />
            </Labeled>
            <Labeled id="site-accent" label="Brand colour">
              <div className="flex items-center gap-2">
                <input
                  id="site-accent"
                  type="color"
                  value={hexToRgbTriplet(draft.accent_color) ? draft.accent_color : DEFAULT_ACCENT}
                  onChange={(e) => set('accent_color', e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface2 p-1 coarse:h-11"
                />
                <input
                  aria-label="Brand colour hex"
                  className={inputClass}
                  maxLength={7}
                  value={draft.accent_color}
                  onChange={(e) => set('accent_color', e.target.value)}
                />
              </div>
            </Labeled>
            {TEXT_FIELDS.slice(0, 1).map((f) => (
              <Labeled key={f.key} id={`site-${f.key}`} label={f.label} hint={f.hint}>
                <input
                  id={`site-${f.key}`}
                  className={inputClass}
                  placeholder={f.placeholder}
                  value={(draft[f.key] as string | null) ?? ''}
                  onChange={(e) => set(f.key, e.target.value as never)}
                />
              </Labeled>
            ))}
          </div>

          <div className="space-y-4 border-t border-line pt-4">
            <h3 className="text-xs font-semibold text-fg">Home page headline</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled id="site-hero-title" label="Headline">
                <input
                  id="site-hero-title"
                  className={inputClass}
                  maxLength={120}
                  value={draft.hero_title ?? ''}
                  onChange={(e) => set('hero_title', e.target.value)}
                />
              </Labeled>
              <Labeled id="site-hero-highlight" label="Word to colour" hint="Must appear in the headline.">
                <input
                  id="site-hero-highlight"
                  className={inputClass}
                  maxLength={60}
                  value={draft.hero_highlight ?? ''}
                  onChange={(e) => set('hero_highlight', e.target.value)}
                />
              </Labeled>
            </div>
            <Labeled id="site-hero-subtitle" label="Intro text">
              <textarea
                id="site-hero-subtitle"
                rows={2}
                maxLength={300}
                className={inputClass}
                value={draft.hero_subtitle ?? ''}
                onChange={(e) => set('hero_subtitle', e.target.value)}
              />
            </Labeled>
          </div>

          <div className="space-y-4 border-t border-line pt-4">
            <h3 className="text-xs font-semibold text-fg">Contact and social</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {TEXT_FIELDS.slice(1).map((f) => (
                <Labeled key={f.key} id={`site-${f.key}`} label={f.label} hint={f.hint}>
                  <input
                    id={`site-${f.key}`}
                    type={f.type ?? 'text'}
                    className={inputClass}
                    placeholder={f.placeholder}
                    value={(draft[f.key] as string | null) ?? ''}
                    onChange={(e) => set(f.key, e.target.value as never)}
                  />
                </Labeled>
              ))}
            </div>
            <Labeled id="site-hours" label="Opening hours" hint="One line per entry.">
              <textarea
                id="site-hours"
                rows={3}
                maxLength={300}
                className={inputClass}
                placeholder={'Mon to Fri: 8:00 to 18:00\nSat: 9:00 to 14:00\nSun: Closed'}
                value={draft.hours ?? ''}
                onChange={(e) => set('hours', e.target.value)}
              />
            </Labeled>
          </div>

          <fieldset className="space-y-2 border-t border-line pt-4">
            <legend className="text-xs font-semibold text-fg">Navigation</legend>
            <p className="text-[11px] text-fg3">How visitors move around your website.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['tabbar', 'Liquid glass tab bar', 'A floating glass bar at the bottom of the screen, with an animated bead on the current page.'],
                  ['classic', 'Classic header menu', 'All sections listed in the header at the top, with a menu button on phones.'],
                ] as const
              ).map(([value, title, text]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    (draft.nav_style ?? 'tabbar') === value ? 'border-accent bg-accent/5' : 'border-line bg-surface2'
                  }`}
                >
                  <input
                    type="radio"
                    name="site-nav-style"
                    value={value}
                    checked={(draft.nav_style ?? 'tabbar') === value}
                    onChange={() => set('nav_style', value)}
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-fg">{title}</span>
                    <span className="block text-[11px] text-fg2">{text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3 rounded-lg border border-line bg-surface2 p-3">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => set('published', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
            />
            <span>
              <span className="block text-xs font-semibold text-fg">Published</span>
              <span className="block text-[11px] text-fg2">
                When off, visitors see "not found" at your web address. Turn on when your details are ready.
              </span>
            </span>
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canEdit && (
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save website'}
            </Button>
          )}
          <a
            href={siteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden />
            {site.published ? 'Open website' : 'Preview address'}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          {saved && (
            <span role="status" className="text-xs text-ok">
              Saved. Your website updates straight away.
            </span>
          )}
          {!canEdit && <span className="text-xs text-fg3">Only a Manager can change the website.</span>}
        </div>
      </Card>
    </form>
  );
}
