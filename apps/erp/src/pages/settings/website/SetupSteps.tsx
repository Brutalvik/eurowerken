import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Lock, Trash2 } from 'lucide-react';
import {
  SITE_FIXED_FEATURES,
  SITE_FONTS,
  SITE_RADII,
  SITE_SECTIONS,
  SITE_THEME_PRESETS,
  siteFont,
  siteRadiusScale,
} from '@eurowerken/shared';
import type { NavStyle, SiteFontId, SiteMode, SiteRadiusId, SiteSection, SiteTheme } from '@eurowerken/shared';
import { CUSTOMER_SITE_URL } from '@/config/customerSite';
import { Button } from '@/components/ui/Button';
import { ErrorNote, Labeled, inputClass } from '../../inventory/PartForm';
import { IMAGE_ACCEPT, cleanSlug, isHex, themeName } from './siteDraft';
import type { SiteDraft } from './siteDraft';

export type StepId = 'welcome' | 'address' | 'style' | 'layout' | 'home' | 'content' | 'review';

export const STEPS: { id: StepId; title: string; short: string }[] = [
  { id: 'welcome', title: 'Welcome', short: 'Welcome' },
  { id: 'address', title: 'Web address and name', short: 'Address' },
  { id: 'style', title: 'Colours and style', short: 'Colours' },
  { id: 'layout', title: 'Layout', short: 'Layout' },
  { id: 'home', title: 'Home page', short: 'Home page' },
  { id: 'content', title: 'Content', short: 'Content' },
  { id: 'review', title: 'Review and deploy', short: 'Review' },
];

export interface StepProps {
  draft: SiteDraft;
  update: (patch: Partial<SiteDraft>) => void;
}

const siteHost = CUSTOMER_SITE_URL.replace(/^https?:\/\//, '');

function Choice({
  name,
  checked,
  onChange,
  children,
  className = '',
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`relative flex cursor-pointer rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-accent/50 ${
        checked ? 'border-accent bg-accent/5' : 'border-line bg-surface2 hover:border-fg3'
      } ${className}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {checked && (
        <span className="absolute right-2 top-2 rounded-full bg-accent p-0.5 text-white" aria-hidden>
          <Check className="h-3 w-3" />
        </span>
      )}
      {children}
    </label>
  );
}

// 1. Welcome -------------------------------------------------------------------------------------------------------

export function WelcomeStep() {
  return (
    <div className="space-y-5">
      <p className="text-xs text-fg2">
        In a few short steps you choose your web address, colours, layout and home page. The preview shows your real website
        as you go. Nothing is public until you press <strong className="text-fg">Deploy website</strong> on the last step.
      </p>
      <div>
        <h3 className="mb-2 text-xs font-semibold text-fg">Always included</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SITE_FIXED_FEATURES.map((f) => (
            <li key={f.label} className="flex items-start gap-3 rounded-lg border border-line bg-surface2 p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg3" aria-hidden />
              <span>
                <span className="block text-xs font-semibold text-fg">
                  {f.label} <span className="sr-only">(always included)</span>
                </span>
                <span className="block text-[11px] text-fg2">{f.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold text-fg">What you choose next</h3>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-fg2">
          <li>Your web address and the name visitors see.</li>
          <li>A colour style, or your own colour, font and corners.</li>
          <li>The navigation layout.</li>
          <li>Which home page sections show, and in what order.</li>
          <li>Your headline, photo, logo and contact details.</li>
        </ol>
      </div>
    </div>
  );
}

// 2. Address -------------------------------------------------------------------------------------------------------

export function AddressStep({ draft, update }: StepProps) {
  return (
    <div className="grid gap-4">
      <Labeled id="setup-slug" label="Web address" hint={`Your website: ${siteHost}/${draft.slug || '...'}`}>
        <div className="flex items-stretch overflow-hidden rounded-lg border border-line bg-surface2 focus-within:border-accent">
          <span className="hidden items-center border-r border-line px-3 text-xs text-fg3 sm:flex">{siteHost}/</span>
          <input
            id="setup-slug"
            className="w-full min-w-0 bg-transparent px-3 py-2 text-xs text-fg outline-none coarse:min-h-11"
            maxLength={48}
            required
            autoComplete="off"
            spellCheck={false}
            value={draft.slug}
            onChange={(e) => update({ slug: cleanSlug(e.target.value) })}
          />
        </div>
      </Labeled>
      <p className="-mt-2 text-[11px] text-fg3">3 to 48 lowercase letters, digits or hyphens, not starting or ending with a hyphen.</p>
      <Labeled id="setup-name" label="Name on the website">
        <input
          id="setup-name"
          className={inputClass}
          maxLength={60}
          required
          value={draft.display_name ?? ''}
          onChange={(e) => update({ display_name: e.target.value })}
        />
      </Labeled>
      <Labeled id="setup-tagline" label="Tagline" hint="Optional. A short line under your name.">
        <input
          id="setup-tagline"
          className={inputClass}
          maxLength={120}
          placeholder="Premium European Auto Care"
          value={draft.tagline ?? ''}
          onChange={(e) => update({ tagline: e.target.value })}
        />
      </Labeled>
    </div>
  );
}

// 3. Colours and style ---------------------------------------------------------------------------------------------

/** One stylesheet with every font the samples use, removed when the step closes. */
function useSampleFonts() {
  useEffect(() => {
    const seen = new Set<string>();
    const families: string[] = [];
    for (const f of SITE_FONTS) {
      for (const part of f.googleQuery.split('&')) {
        const name = part.split(':')[0];
        if (!seen.has(name)) {
          seen.add(name);
          families.push(part);
        }
      }
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
    link.dataset.ewSiteFonts = '1';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
}

function MiniPreview({ accent, font, radius, mode }: { accent: string; font: SiteFontId; radius: SiteRadiusId; mode: SiteMode }) {
  const f = siteFont(font);
  const r = 8 * siteRadiusScale(radius);
  const dark = mode === 'dark';
  return (
    <div
      aria-hidden
      className="w-full overflow-hidden border"
      style={{
        background: dark ? '#0d1117' : '#ffffff',
        borderColor: dark ? '#1f2937' : '#e5e7eb',
        borderRadius: r,
        padding: 10,
      }}
    >
      <div style={{ fontFamily: f.display, color: dark ? '#f9fafb' : '#111827', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
        Expert <span style={{ color: accent }}>service</span>
      </div>
      <div style={{ fontFamily: f.body, color: dark ? '#9ca3af' : '#6b7280', fontSize: 10, marginTop: 3 }}>Book online in a minute.</div>
      <div className="mt-2 flex gap-1.5">
        <span style={{ background: accent, borderRadius: r, width: 46, height: 14, display: 'block' }} />
        <span
          style={{ border: `1px solid ${dark ? '#374151' : '#d1d5db'}`, borderRadius: r, width: 36, height: 14, display: 'block' }}
        />
      </div>
    </div>
  );
}

export function StyleStep({ draft, update }: StepProps) {
  useSampleFonts();
  const theme = draft.theme;
  const [hexText, setHexText] = useState(draft.accent_color);
  useEffect(() => setHexText(draft.accent_color), [draft.accent_color]);

  const custom = (patch: Partial<SiteTheme>) => update({ theme: { ...theme, ...patch, preset: 'custom' } });
  const setAccent = (hex: string) => update({ accent_color: hex.toLowerCase(), theme: { ...theme, preset: 'custom' } });

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-fg">Pick a style</legend>
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {SITE_THEME_PRESETS.map((p) => {
            const f = siteFont(p.font);
            return (
              <Choice
                key={p.id}
                name="setup-preset"
                checked={theme.preset === p.id}
                onChange={() =>
                  update({ accent_color: p.accent, theme: { preset: p.id, font: p.font, radius: p.radius, mode: p.mode } })
                }
                className="flex-col gap-2"
              >
                <span className="flex items-center gap-2 pr-6">
                  <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ background: p.accent }} aria-hidden />
                  <span className="text-xs font-semibold text-fg">{p.label}</span>
                  <span className="text-[11px] text-fg3">{p.mode === 'dark' ? 'Dark' : 'Light'}</span>
                </span>
                <span className="text-sm text-fg" style={{ fontFamily: f.display }} aria-hidden>
                  Aa Precision service
                </span>
                <MiniPreview accent={p.accent} font={p.font} radius={p.radius} mode={p.mode} />
                <span className="text-[11px] text-fg2">{p.description}</span>
              </Choice>
            );
          })}
          <Choice
            name="setup-preset"
            checked={theme.preset === 'custom'}
            onChange={() => custom({})}
            className="flex-col gap-2"
          >
            <span className="flex items-center gap-2 pr-6">
              <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ background: draft.accent_color }} aria-hidden />
              <span className="text-xs font-semibold text-fg">Custom</span>
            </span>
            <MiniPreview accent={isHex(draft.accent_color) ? draft.accent_color : '#888888'} font={theme.font} radius={theme.radius} mode={theme.mode} />
            <span className="text-[11px] text-fg2">Your own colour, font and corners. Set them below.</span>
          </Choice>
        </div>
      </fieldset>

      <div className="space-y-5 border-t border-line pt-5">
        <div>
          <h3 className="text-xs font-semibold text-fg">Custom style</h3>
          <p className="text-[11px] text-fg3">Changing any of these switches to Custom.</p>
        </div>

        <Labeled id="setup-accent" label="Brand colour">
          <div className="flex items-center gap-2">
            <input
              id="setup-accent"
              type="color"
              value={isHex(draft.accent_color) ? draft.accent_color : '#1d6ff0'}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface2 p-1 coarse:h-11"
            />
            <input
              aria-label="Brand colour as hex"
              aria-invalid={!isHex(hexText)}
              aria-describedby="setup-accent-hint"
              className={`${inputClass} max-w-[9rem] font-mono`}
              maxLength={7}
              value={hexText}
              onChange={(e) => {
                const v = e.target.value.trim();
                setHexText(v);
                if (isHex(v)) setAccent(v);
              }}
            />
          </div>
          <p id="setup-accent-hint" className={`mt-1 text-[11px] ${isHex(hexText) ? 'text-fg3' : 'text-bad'}`}>
            {isHex(hexText) ? 'Six hex digits, like #1d6ff0.' : 'Enter a colour like #1d6ff0.'}
          </p>
        </Labeled>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-fg2">Font</legend>
          <div className="grid gap-2">
            {SITE_FONTS.map((f) => (
              <Choice key={f.id} name="setup-font" checked={theme.font === f.id} onChange={() => custom({ font: f.id })} className="flex-col">
                <span className="text-xs font-semibold text-fg">{f.label}</span>
                <span className="text-base text-fg" style={{ fontFamily: f.display }} aria-hidden>
                  Precision service for your car
                </span>
                <span className="text-[11px] text-fg2" style={{ fontFamily: f.body }}>
                  {f.description}
                </span>
              </Choice>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-fg2">Corners</legend>
          <div className="grid grid-cols-3 gap-2">
            {SITE_RADII.map((r) => (
              <Choice key={r.id} name="setup-radius" checked={theme.radius === r.id} onChange={() => custom({ radius: r.id })} className="flex-col items-center gap-2">
                <span
                  aria-hidden
                  className="block h-8 w-14 border-2 border-accent bg-accent/10"
                  style={{ borderRadius: 10 * r.scale }}
                />
                <span className="text-xs font-semibold text-fg">{r.label}</span>
              </Choice>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-fg2">Default mode</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['light', 'Light'],
                ['dark', 'Dark'],
              ] as const
            ).map(([mode, label]) => (
              <Choice key={mode} name="setup-mode" checked={theme.mode === mode} onChange={() => custom({ mode })} className="items-center gap-2">
                <span
                  aria-hidden
                  className="h-5 w-8 rounded border border-line"
                  style={{ background: mode === 'dark' ? '#0d1117' : '#ffffff' }}
                />
                <span className="text-xs font-semibold text-fg">{label}</span>
              </Choice>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-fg3">What first-time visitors see. They can still switch.</p>
        </fieldset>
      </div>
    </div>
  );
}

// 4. Layout --------------------------------------------------------------------------------------------------------

function NavIllustration({ style }: { style: NavStyle }) {
  return (
    <div aria-hidden className="relative h-28 w-full overflow-hidden rounded-md border border-line bg-surface">
      {style === 'tabbar' ? (
        <>
          <div className="absolute left-1/2 top-2 h-4 w-24 -translate-x-1/2 rounded-full border border-white/40 bg-fg3/20 backdrop-blur" />
          <div className="absolute inset-x-3 top-9 space-y-1.5">
            <div className="h-2 w-2/3 rounded bg-fg3/30" />
            <div className="h-2 w-1/2 rounded bg-fg3/20" />
          </div>
          <div className="absolute bottom-2 left-1/2 flex h-7 w-36 -translate-x-1/2 items-center justify-around rounded-full border border-white/40 bg-fg3/20 px-2 backdrop-blur">
            <span className="h-3 w-3 rounded-full bg-accent" />
            <span className="h-3 w-3 rounded-full bg-fg3/50" />
            <span className="h-3 w-3 rounded-full bg-fg3/50" />
            <span className="h-3 w-3 rounded-full bg-fg3/50" />
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 flex h-6 items-center gap-2 border-b border-line bg-surface2 px-2">
            <span className="h-2.5 w-8 rounded bg-fg3/50" />
            <span className="ml-auto h-1.5 w-6 rounded bg-fg3/40" />
            <span className="h-1.5 w-6 rounded bg-fg3/40" />
            <span className="h-1.5 w-6 rounded bg-fg3/40" />
            <span className="h-3 w-8 rounded bg-accent" />
          </div>
          <div className="absolute inset-x-3 top-9 space-y-1.5">
            <div className="h-2 w-2/3 rounded bg-fg3/30" />
            <div className="h-2 w-1/2 rounded bg-fg3/20" />
          </div>
        </>
      )}
    </div>
  );
}

export function LayoutStep({ draft, update }: StepProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs text-fg2">How visitors move around your website.</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['tabbar', 'Liquid glass tab bar', 'A floating glass pill at the top and a tab bar at the bottom of the screen. Feels like an app on phones.'],
            ['classic', 'Classic header menu', 'All sections listed in a full header at the top, with a menu button on phones.'],
          ] as const
        ).map(([value, title, text]) => (
          <Choice key={value} name="setup-nav" checked={draft.nav_style === value} onChange={() => update({ nav_style: value })} className="flex-col gap-2">
            <NavIllustration style={value} />
            <span className="text-xs font-semibold text-fg">{title}</span>
            <span className="text-[11px] text-fg2">{text}</span>
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

// 5. Home page -----------------------------------------------------------------------------------------------------

export function HomeStep({ draft, update }: StepProps) {
  const list = draft.sections;
  const focusAfter = useRef<string | null>(null);

  useEffect(() => {
    if (!focusAfter.current) return;
    const el = document.getElementById(focusAfter.current) as HTMLButtonElement | null;
    focusAfter.current = null;
    if (el && !el.disabled) el.focus();
  });

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    const next: SiteSection[] = [...list];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    // Keep focus on the moved row; at the end of the list the other button.
    const atEdge = to === 0 || to === list.length - 1;
    focusAfter.current = `setup-sec-${item.id}-${atEdge ? (by === -1 ? 'down' : 'up') : by === -1 ? 'up' : 'down'}`;
    update({ sections: next });
  };

  const toggle = (index: number) => update({ sections: list.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s)) });

  const live = list.filter((s) => s.enabled).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg2">
        Turn sections on or off and put them in order. {live} of {list.length} sections are on.
      </p>
      <ol className="space-y-2">
        <li className="flex items-center gap-3 rounded-lg border border-line bg-surface2 p-3">
          <Lock className="h-4 w-4 shrink-0 text-fg3" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-fg">Hero</span>
            <span className="block text-[11px] text-fg2">Your headline, photo and booking button. Always first.</span>
          </span>
          <span className="text-[11px] text-fg3">Always on</span>
        </li>
        {list.map((s, i) => {
          const def = SITE_SECTIONS.find((d) => d.id === s.id);
          if (!def) return null;
          const labelId = `setup-sec-${s.id}-label`;
          return (
            <li
              key={s.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:flex-nowrap ${s.enabled ? 'border-line bg-surface2' : 'border-dashed border-line bg-transparent'}`}
            >
              <button
                type="button"
                role="switch"
                aria-checked={s.enabled}
                aria-labelledby={labelId}
                onClick={() => toggle(i)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 coarse:h-6 coarse:w-11 ${
                  s.enabled ? 'bg-accent' : 'bg-fg3/40'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all coarse:h-5 coarse:w-5 ${s.enabled ? 'left-[18px] coarse:left-[22px]' : 'left-0.5'}`}
                />
              </button>
              <span className="min-w-0 flex-1">
                <span id={labelId} className={`block text-xs font-semibold ${s.enabled ? 'text-fg' : 'text-fg3'}`}>
                  {def.label}
                </span>
                <span className="block text-[11px] text-fg2">{def.description}</span>
              </span>
              <span className="ml-auto flex gap-1">
                <Button
                  id={`setup-sec-${s.id}-up`}
                  variant="ghost"
                  size="sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${def.label} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  id={`setup-sec-${s.id}-down`}
                  variant="ghost"
                  size="sm"
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${def.label} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-fg3">Booking, tracking, My Garage, sign-in and invoices are always part of your site.</p>
    </div>
  );
}

// 6. Content -------------------------------------------------------------------------------------------------------

interface ImageFieldProps {
  id: string;
  label: string;
  hint: string;
  url: string | null;
  busy: boolean;
  wide?: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}

function ImageField({ id, label, hint, url, busy, wide = false, onFile, onRemove }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-xs font-medium text-fg2">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface2 ${wide ? 'h-20 w-36' : 'h-16 w-16'}`}
        >
          {url ? (
            <img src={url} alt={`Current ${label.toLowerCase()}`} className={`h-full w-full ${wide ? 'object-cover' : 'object-contain'}`} />
          ) : (
            <span className="px-2 text-center text-[10px] text-fg3">{wide ? 'Built-in picture' : 'No logo'}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            aria-labelledby={`${id}-label`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onFile(f);
            }}
          />
          <Button variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
            {busy ? 'Uploading...' : url ? 'Replace' : 'Upload'}
          </Button>
          {url && (
            <Button variant="ghost" disabled={busy} onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-fg3">{hint}</p>
    </div>
  );
}

export interface ContentStepProps extends StepProps {
  uploading: 'hero' | 'logo' | null;
  imageError: string | null;
  onImage: (kind: 'hero' | 'logo', file: File) => void;
  onRemoveImage: (kind: 'hero' | 'logo') => void;
}

const CONTACT_FIELDS: { key: keyof SiteDraft; label: string; type?: string; placeholder?: string; hint?: string; max: number }[] = [
  { key: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 123-4567', max: 40 },
  { key: 'email', label: 'Contact email', type: 'email', placeholder: 'service@example.com', max: 120 },
  { key: 'address', label: 'Address', placeholder: '1234 Autobahn Drive, Calgary, AB', max: 200 },
  { key: 'instagram_url', label: 'Instagram', type: 'url', placeholder: 'https://instagram.com/...', max: 300 },
  { key: 'facebook_url', label: 'Facebook', type: 'url', placeholder: 'https://facebook.com/...', max: 300 },
  { key: 'youtube_url', label: 'YouTube', type: 'url', placeholder: 'https://youtube.com/...', max: 300 },
  {
    key: 'own_website_url',
    label: 'Your own website',
    type: 'url',
    placeholder: 'https://www.yourworkshop.com',
    hint: 'Optional. If you already have a website, customers see a "Visit our website" link.',
    max: 300,
  },
];

export function ContentStep({ draft, update, uploading, imageError, onImage, onRemoveImage }: ContentStepProps) {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const title = str(draft.hero_title);
  const highlight = str(draft.hero_highlight).trim();
  const highlightMissing = highlight !== '' && !title.toLowerCase().includes(highlight.toLowerCase());
  return (
    <div className="space-y-6">
      <section className="space-y-4" aria-labelledby="setup-hero-h">
        <h3 id="setup-hero-h" className="text-xs font-semibold text-fg">
          Home page headline
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled id="setup-hero-title" label="Headline">
            <input id="setup-hero-title" className={inputClass} maxLength={120} value={title} onChange={(e) => update({ hero_title: e.target.value })} />
          </Labeled>
          <div>
            <Labeled id="setup-hero-highlight" label="Highlighted word" hint="Shown in your brand colour. Must appear in the headline.">
              <input
                id="setup-hero-highlight"
                className={inputClass}
                maxLength={60}
                aria-describedby={highlightMissing ? 'setup-hero-highlight-warn' : undefined}
                value={str(draft.hero_highlight)}
                onChange={(e) => update({ hero_highlight: e.target.value })}
              />
            </Labeled>
            {highlightMissing && (
              <p id="setup-hero-highlight-warn" className="mt-1 text-[11px] text-warn">
                "{highlight}" is not in the headline, so nothing is highlighted.
              </p>
            )}
          </div>
        </div>
        <Labeled id="setup-hero-subtitle" label="Subtitle">
          <textarea
            id="setup-hero-subtitle"
            rows={2}
            maxLength={300}
            className={inputClass}
            value={str(draft.hero_subtitle)}
            onChange={(e) => update({ hero_subtitle: e.target.value })}
          />
        </Labeled>
      </section>

      <section className="space-y-4 border-t border-line pt-5" aria-labelledby="setup-pictures-h">
        <h3 id="setup-pictures-h" className="text-xs font-semibold text-fg">
          Pictures
        </h3>
        <ImageField
          id="setup-hero-photo"
          label="Hero photo"
          hint="Optional. PNG, JPEG or WebP. A wide photo works best; it is shrunk to 2000 px. Without one, a built-in picture shows."
          url={draft.hero_image_url ?? null}
          busy={uploading === 'hero'}
          wide
          onFile={(f) => onImage('hero', f)}
          onRemove={() => onRemoveImage('hero')}
        />
        <ImageField
          id="setup-logo"
          label="Logo"
          hint="Optional. PNG, JPEG or WebP. A square image works best."
          url={draft.logo_url ?? null}
          busy={uploading === 'logo'}
          onFile={(f) => onImage('logo', f)}
          onRemove={() => onRemoveImage('logo')}
        />
        <ErrorNote errors={imageError} />
      </section>

      <section className="space-y-4 border-t border-line pt-5" aria-labelledby="setup-contact-h">
        <h3 id="setup-contact-h" className="text-xs font-semibold text-fg">
          Contact and social
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map((f) => (
            <Labeled key={f.key} id={`setup-${f.key}`} label={f.label} hint={f.hint}>
              <input
                id={`setup-${f.key}`}
                type={f.type ?? 'text'}
                className={inputClass}
                placeholder={f.placeholder}
                maxLength={f.max}
                value={str(draft[f.key])}
                onChange={(e) => update({ [f.key]: e.target.value } as Partial<SiteDraft>)}
              />
            </Labeled>
          ))}
        </div>
        <Labeled
          id="setup-hours"
          label="Opening hours"
          hint="Optional, one line per entry, for example Mon to Fri: 8:00 to 18:00. Booking times always follow Settings, Booking."
        >
          <textarea
            id="setup-hours"
            rows={3}
            maxLength={300}
            className={inputClass}
            value={str(draft.hours)}
            onChange={(e) => update({ hours: e.target.value })}
          />
        </Labeled>
      </section>
    </div>
  );
}

// 7. Review --------------------------------------------------------------------------------------------------------

function Row({ label, value, step, onEdit }: { label: string; value: ReactNode; step: StepId; onEdit: (s: StepId) => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="w-32 shrink-0 text-[11px] font-medium text-fg3">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-xs text-fg">{value}</dd>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="shrink-0 text-xs font-medium text-accent hover:underline coarse:min-h-9"
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        Edit
      </button>
    </div>
  );
}

export function ReviewStep({ draft, onEdit }: { draft: SiteDraft; onEdit: (s: StepId) => void }) {
  const t = draft.theme;
  const on = draft.sections.filter((s) => s.enabled).map((s) => SITE_SECTIONS.find((d) => d.id === s.id)?.label ?? s.id);
  const v = (x: unknown) => (typeof x === 'string' && x.trim() ? x : <span className="text-fg3">Not set</span>);
  const contacts = [draft.phone, draft.email, draft.address].filter((x) => typeof x === 'string' && x.trim()).join(', ');
  const socials = [
    draft.instagram_url && 'Instagram',
    draft.facebook_url && 'Facebook',
    draft.youtube_url && 'YouTube',
    draft.own_website_url && 'Own website',
  ].filter(Boolean);
  return (
    <dl className="rounded-lg border border-line bg-surface2 px-3">
      <Row label="Web address" step="address" onEdit={onEdit} value={`${siteHost}/${draft.slug}`} />
      <Row label="Name" step="address" onEdit={onEdit} value={v(draft.display_name)} />
      <Row label="Tagline" step="address" onEdit={onEdit} value={v(draft.tagline)} />
      <Row
        label="Style"
        step="style"
        onEdit={onEdit}
        value={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: draft.accent_color }} aria-hidden />
            {themeName(t)}, {draft.accent_color}, {siteFont(t.font).label} font,{' '}
            {SITE_RADII.find((r) => r.id === t.radius)?.label ?? t.radius} corners, {t.mode === 'dark' ? 'dark' : 'light'} mode
          </span>
        }
      />
      <Row label="Layout" step="layout" onEdit={onEdit} value={draft.nav_style === 'classic' ? 'Classic header menu' : 'Liquid glass tab bar'} />
      <Row
        label="Home page"
        step="home"
        onEdit={onEdit}
        value={on.length ? `Hero, then ${on.join(', ')}` : 'Hero only'}
      />
      <Row label="Headline" step="content" onEdit={onEdit} value={v(draft.hero_title)} />
      <Row
        label="Pictures"
        step="content"
        onEdit={onEdit}
        value={`${draft.hero_image_url ? 'Own hero photo' : 'Built-in hero picture'}, ${draft.logo_url ? 'logo set' : 'no logo'}`}
      />
      <Row label="Contact" step="content" onEdit={onEdit} value={contacts || <span className="text-fg3">Not set</span>} />
      <Row label="Links" step="content" onEdit={onEdit} value={socials.length ? socials.join(', ') : <span className="text-fg3">None</span>} />
    </dl>
  );
}
