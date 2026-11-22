import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Disc3,
  Gauge,
  ScanLine,
  ShieldCheck,
  Snowflake,
  Tag,
  Wrench,
  Zap,
} from 'lucide-react';
import { SERVICE_CATEGORY_IDS, SERVICE_CATEGORY_LABELS } from '@eurowerken/shared';
import type { ServiceCategoryId as CategoryId } from '@eurowerken/shared';
import { useServices } from '@/api/catalogue';
import type { Service } from '@/api/catalogue';
import { Photo } from '@/components/Photo';
import { SERVICE_ICON_COMPONENTS } from '@/components/serviceIcons';
import { EmptyCatalogue, LoadError, PageHero, Pill, SkeletonGrid } from '@/components/ui';
import { SERVICE_FAQ, VEHICLE_MAKES } from '@/data/catalog';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';

type SortKey = 'popularity' | 'price-asc' | 'price-desc';

const SERVICE_ICONS = SERVICE_ICON_COMPONENTS;

const CATEGORY_ICONS: Record<CategoryId, LucideIcon> = {
  maintenance: Wrench,
  diagnostics: ScanLine,
  performance: Gauge,
  brakes: Disc3,
  climate: Snowflake,
  electrical: Zap,
};

/** A service named like "Milestone" is featured in its own card under the list. */
const MILESTONE = /milestone/i;

/** Makes named in the "Specialized expertise for" row: text only, no logos. */
const SPECIALIZED_MAKES = [...Object.keys(VEHICLE_MAKES), 'Mini'];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'popularity', label: 'Popularity' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

const BADGE_RANK: Record<NonNullable<Service['badge']> | 'none', number> = { Popular: 0, Recommended: 1, none: 2 };

function sortServices(list: Service[], sort: SortKey): Service[] {
  const copy = [...list];
  if (sort === 'price-asc') return copy.sort((a, b) => a.priceFrom - b.priceFrom);
  if (sort === 'price-desc') return copy.sort((a, b) => b.priceFrom - a.priceFrom);
  // Popularity: badged services first, otherwise the catalogue order (sort is stable).
  return copy.sort((a, b) => BADGE_RANK[a.badge ?? 'none'] - BADGE_RANK[b.badge ?? 'none']);
}

/** Scrolls to a section and moves focus there, so keyboard users land in the right place. */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

export function ServicesPage() {
  return (
    <>
      <PageHero
        title="Precision Services for Elite Vehicles"
        subtitle="From routine maintenance to complex engine rebuilds, our master technicians provide dealership-level care without the dealership price tag."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => scrollToSection('services-list')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-fg shadow-lg shadow-accent/20 transition hover:opacity-90 coarse:min-h-12"
          >
            Explore Services
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('warranty')}
            className="glass-dark inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 coarse:min-h-12"
          >
            View Warranty Info
          </button>
        </div>
      </PageHero>
      <SpecializedMakes />
      <ServiceCatalogue />
      <FaqAndGuarantee />
    </>
  );
}

function SpecializedMakes() {
  return (
    <section aria-labelledby="makes-heading" className="border-b border-line/70 py-10">
      <div className="container-site text-center">
        <h2 id="makes-heading" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg3">
          Specialized expertise for
        </h2>
        <ul className="mt-5 flex flex-wrap justify-center gap-2 sm:gap-3">
          {SPECIALIZED_MAKES.map((make) => (
            <li
              key={make}
              className="rounded-full border border-line bg-surface/70 px-4 py-2 font-display text-sm font-semibold tracking-wide text-fg2"
            >
              {make}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ServiceCatalogue() {
  const { data, loading, error, retry } = useServices();

  let body: ReactNode;
  if (loading) body = <SkeletonGrid label="Loading services" />;
  else if (error || !data) body = <LoadError what="services" onRetry={retry} />;
  else if (data.length === 0)
    body = (
      <EmptyCatalogue
        Icon={Wrench}
        title="Services are coming soon"
        text="This workshop has not listed its services online yet. Call us or visit the workshop and we will help with whatever your car needs."
      />
    );
  else body = <ServiceList services={data} />;

  return (
    <section id="services-list" tabIndex={-1} aria-label="Services" className="container-site scroll-mt-24 py-12 outline-none sm:py-16">
      {body}
    </section>
  );
}

function ServiceList({ services: all }: { services: Service[] }) {
  const site = useSite();
  const [picked, setPicked] = useState<CategoryId | null>(null);
  const [sort, setSort] = useState<SortKey>('popularity');

  const featured = all.find((s) => MILESTONE.test(s.name));
  const listed = useMemo(() => all.filter((s) => s !== featured), [all, featured]);
  const categories = useMemo(
    () => SERVICE_CATEGORY_IDS.filter((id) => listed.some((s) => s.category === id)).map((id) => ({ id, name: SERVICE_CATEGORY_LABELS[id] })),
    [listed],
  );
  const category = categories.find((c) => c.id === picked) ?? categories[0];
  const services = useMemo(
    () => (category ? sortServices(listed.filter((s) => s.category === category.id), sort) : []),
    [listed, category, sort],
  );
  const countFor = (id: CategoryId) => listed.filter((s) => s.category === id).length;
  const diagnostic = all.find((s) => s.category === 'diagnostics');

  if (!category) {
    // Only the featured service is listed.
    return featured ? <MilestoneCard service={featured} /> : null;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Desktop: category list in a sticky side panel. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <nav aria-label="Service categories" className="glass rounded-2xl p-4">
            <h2 className="px-2 font-display text-base font-semibold text-fg">Categories</h2>
            <ul className="mt-3 space-y-1">
              {categories.map((c) => {
                const Icon = CATEGORY_ICONS[c.id];
                const active = c.id === category.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(c.id)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        active ? 'bg-accent/10 font-semibold text-accent' : 'text-fg2 hover:bg-surface2 hover:text-fg'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1">{c.name}</span>
                      {active ? (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      ) : (
                        <span className="text-xs text-fg3">{countFor(c.id)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <NeedHelpCard diagnostic={diagnostic} />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phones and tablets: categories as a sideways-scrolling chip row. */}
        <nav aria-label="Service categories" className="lg:hidden">
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {categories.map((c) => {
              const Icon = CATEGORY_ICONS[c.id];
              const active = c.id === category.id;
              return (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setPicked(c.id)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition coarse:min-h-11 ${
                      active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-fg2 hover:text-fg'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mt-0">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">{category.name}</h2>
            <p className="mt-1 text-sm text-fg3" aria-live="polite">
              {services.length} {services.length === 1 ? 'service' : 'services'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="service-sort" className="shrink-0 text-xs font-medium text-fg2">
              Sort by
            </label>
            <select
              id="service-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="input w-full py-2 sm:w-52"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <li key={s.id}>
              <ServiceCard service={s} bookTo={`${sitePath(site, 'book')}?service=${encodeURIComponent(s.id)}`} />
            </li>
          ))}
        </ul>

        {featured && <MilestoneCard service={featured} />}

        <div className="mt-8 lg:hidden">
          <NeedHelpCard diagnostic={diagnostic} />
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service, bookTo }: { service: Service; bookTo: string }) {
  const Icon = SERVICE_ICONS[service.icon];
  return (
    <article className="glass flex h-full flex-col rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {service.badge && <Pill tone={service.badge === 'Popular' ? 'ok' : 'accent'}>{service.badge}</Pill>}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-fg">{service.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-fg2">{service.text}</p>
      <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
        {service.duration && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-fg3">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Est. time
            </dt>
            <dd className="text-right font-medium text-fg">{service.duration}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-fg3">
            <Tag className="h-3.5 w-3.5" aria-hidden />
            Starting at
          </dt>
          <dd className="font-display text-base font-bold text-ink">{formatMoney(service.priceFrom)}</dd>
        </div>
      </dl>
      <Link to={bookTo} className="btn-ink mt-5 w-full py-2.5" aria-label={`Book ${service.name}`}>
        Book This Service
      </Link>
    </article>
  );
}

function MilestoneCard({ service }: { service: Service }) {
  const site = useSite();
  return (
    <article className="glass-strong mt-8 overflow-hidden rounded-3xl md:grid md:grid-cols-[2fr_3fr]">
      <Photo
        src={service.image}
        name="service-milestone"
        alt={service.name}
        icon={Wrench}
        className="aspect-[16/10] w-full md:aspect-auto md:h-full md:min-h-[280px]"
      />
      <div className="flex min-w-0 flex-col p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="min-w-0 font-display text-xl font-semibold text-fg">{service.name}</h3>
          <Pill tone="accent">{service.badge ?? 'Recommended'}</Pill>
        </div>
        {service.text && <p className="mt-3 text-sm leading-relaxed text-fg2">{service.text}</p>}
        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-end sm:justify-between">
          <dl className="flex gap-8">
            {service.duration && (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg3">Est. duration</dt>
                <dd className="mt-1 font-display font-semibold text-fg">{service.duration}</dd>
              </div>
            )}
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg3">Starting at</dt>
              <dd className="mt-1 font-display font-semibold text-fg">{formatMoney(service.priceFrom)}</dd>
            </div>
          </dl>
          <Link to={`${sitePath(site, 'book')}?service=${encodeURIComponent(service.id)}`} className="btn-ink py-2.5">
            Request Quote &amp; Book
          </Link>
        </div>
      </div>
    </article>
  );
}

function NeedHelpCard({ diagnostic }: { diagnostic?: Service }) {
  const site = useSite();
  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/5 p-5">
      <div className="flex items-center gap-2">
        <CircleHelp className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="text-sm font-semibold text-fg">Need help?</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-fg2">Not sure what service you need? Book a diagnostic session and we will find out.</p>
      <Link
        to={diagnostic ? `${sitePath(site, 'book')}?service=${encodeURIComponent(diagnostic.id)}` : sitePath(site, 'book')}
        className="btn-outline mt-4 w-full py-2.5"
      >
        Book Diagnostic
      </Link>
    </div>
  );
}

function FaqAndGuarantee() {
  return (
    <section className="container-site grid gap-8 pb-20 pt-4 sm:pb-24 lg:grid-cols-2 lg:gap-12">
      <Faq />
      <Guarantee />
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">Frequently Asked Questions</h2>
      <ul className="mt-6 space-y-3">
        {SERVICE_FAQ.map((item, i) => {
          const expanded = open === i;
          const panelId = `faq-panel-${i}`;
          const buttonId = `faq-button-${i}`;
          return (
            <li key={item.q} className="glass overflow-hidden rounded-2xl">
              <h3>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-fg transition hover:text-accent coarse:min-h-12"
                >
                  {item.q}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-fg3 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </h3>
              <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded} className="px-5 pb-5 text-sm leading-relaxed text-fg2">
                {item.a}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Guarantee() {
  const site = useSite();
  return (
    <section
      id="warranty"
      tabIndex={-1}
      aria-labelledby="warranty-heading"
      className="relative scroll-mt-24 self-start overflow-hidden rounded-3xl bg-sidebar p-6 text-white outline-none dark:bg-surface sm:p-8"
    >
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
      <div className="relative">
        <span className="glass-dark flex h-12 w-12 items-center justify-center rounded-xl text-accent">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </span>
        <h2 id="warranty-heading" className="mt-5 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          The {site.display_name} Guarantee
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          We stand behind our work. Every repair and service performed at {site.display_name} is backed by our warranty, so you
          have peace of mind long after you leave the shop.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-4">
          <div className="glass-dark flex flex-col-reverse rounded-2xl p-4">
            <dt className="mt-1 text-xs text-white/60">Parts warranty</dt>
            <dd className="font-display text-2xl font-bold sm:text-3xl">3 Years</dd>
          </div>
          <div className="glass-dark flex flex-col-reverse rounded-2xl p-4">
            <dt className="mt-1 text-xs text-white/60">Labour guarantee</dt>
            <dd className="font-display text-2xl font-bold sm:text-3xl">36,000 km</dd>
          </div>
        </dl>
        <Link
          to={sitePath(site, 'terms')}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline coarse:min-h-11"
        >
          Read full warranty terms <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
