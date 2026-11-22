import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Briefcase, CalendarCheck, Car, ChevronDown, Languages, SearchX, SlidersHorizontal, User, Users, X } from 'lucide-react';
import { useTeam } from '@/api/catalogue';
import type { Technician } from '@/api/catalogue';
import { Photo } from '@/components/Photo';
import { EmptyCatalogue, LoadError, PageHero, SkeletonGrid, Stars } from '@/components/ui';
import { ServicesExpertsSwitch } from '@/components/ui/SectionSwitch';
import { sitePath, useSite } from '@/site/SiteContext';
import {
  EMPTY_FILTERS,
  MIN_YEARS_OPTIONS,
  activeFilterCount,
  languageOptions,
  makeOptions,
  matchesFilters,
  specialtyOptions,
} from '@/pages/experts/filters';
import type { ExpertFilters } from '@/pages/experts/filters';

const numberFormat = new Intl.NumberFormat('en-CA');

export function ExpertsPage() {
  const site = useSite();
  const { data, loading, error, retry } = useTeam();

  return (
    <>
      <PageHero
        title="Meet Our Experts"
        subtitle={`Factory-trained specialists at ${site.display_name}. Find the technician who knows your make, speaks your language, and has solved your problem before.`}
      />
      <ServicesExpertsSwitch />

      <section aria-label="Technician directory" className="container-site py-10 sm:py-14">
        {loading ? (
          <SkeletonGrid label="Loading the team" count={4} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" card="h-80" />
        ) : error || !data ? (
          <LoadError what="team" onRetry={retry} />
        ) : data.length === 0 ? (
          <EmptyCatalogue
            Icon={Users}
            title="Meet the team at the workshop"
            text="This workshop has not introduced its team online yet. Call us or visit the workshop and we will match you with the right specialist."
          />
        ) : (
          <Directory team={data} />
        )}
      </section>
    </>
  );
}

function Directory({ team }: { team: Technician[] }) {
  const [filters, setFilters] = useState<ExpertFilters>(EMPTY_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const options = useMemo(
    () => ({ specialties: specialtyOptions(team), makes: makeOptions(team), languages: languageOptions(team) }),
    [team],
  );

  const results = useMemo(() => team.filter((t) => matchesFilters(t, filters)), [team, filters]);
  const active = activeFilterCount(filters);

  function update<K extends keyof ExpertFilters>(key: K, value: ExpertFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <>
      <form
        role="search"
        aria-label="Filter technicians"
        onSubmit={(e) => e.preventDefault()}
        className="glass-strong rounded-2xl p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-fg">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden />
            Filter technicians
          </h2>
          {active > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:underline coarse:min-h-11"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters ({active})
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect id="f-specialty" label="Specialty" value={filters.specialty} onChange={(v) => update('specialty', v)} allLabel="All specialties" options={options.specialties} />
          <FilterSelect id="f-make" label="Vehicle make" value={filters.make} onChange={(v) => update('make', v)} allLabel="All makes" options={options.makes} />
          <FilterSelect id="f-language" label="Language" value={filters.language} onChange={(v) => update('language', v)} allLabel="Any language" options={options.languages} />
          <div>
            <label htmlFor="f-years" className="label">
              Minimum experience
            </label>
            <select id="f-years" className="input" value={filters.minYears} onChange={(e) => update('minYears', Number(e.target.value))}>
              {MIN_YEARS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      <p className="mt-6 text-sm text-fg3" aria-live="polite">
        Showing {results.length} of {team.length} {team.length === 1 ? 'team member' : 'team members'}
      </p>

      {results.length === 0 ? (
        <div className="glass mt-4 flex flex-col items-center rounded-2xl px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface2 text-fg3">
            <SearchX className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold text-fg">No technicians match these filters</h2>
          <p className="mt-1.5 max-w-sm text-sm text-fg2">Try fewer filters, or call us and we will match you with the right specialist.</p>
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="btn-outline mt-6">
            Clear filters
          </button>
        </div>
      ) : (
        /* The open profile spans a full row; grid-flow-dense lets the cards after it fill the gap in the row above. */
        <ul className="mt-4 grid grid-flow-row-dense gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((t) => {
            const open = openId === t.id;
            return (
              <Fragment key={t.id}>
                <li>
                  <TechnicianCard tech={t} open={open} onToggle={() => setOpenId(open ? null : t.id)} />
                </li>
                {open && (
                  <li className="col-span-full">
                    <TechnicianDetail tech={t} onClose={() => setOpenId(null)} />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: string[];
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Chip({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'accent' }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${tone === 'accent' ? 'bg-accent/10 text-accent' : 'bg-surface2 text-fg2'}`}
    >
      {children}
    </span>
  );
}

function yearsLabel(years: number): string {
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

function TechnicianCard({ tech, open, onToggle }: { tech: Technician; open: boolean; onToggle: () => void }) {
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
        open ? 'border-accent ring-2 ring-accent/20' : 'border-line'
      }`}
    >
      <Photo src={tech.image} alt={`${tech.name}, ${tech.role}`} icon={User} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display font-semibold text-fg">{tech.name}</h3>
        <p className="text-sm text-fg2">{tech.role}</p>
        {tech.rating !== undefined && (
          <div className="mt-2 flex items-center gap-1.5">
            <Stars rating={tech.rating} />
            <span className="text-xs font-semibold text-fg">{tech.rating.toFixed(1)}</span>
          </div>
        )}
        {(tech.years !== null || tech.jobs !== undefined) && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {tech.years !== null && (
              <div className="rounded-lg bg-surface2/70 px-2.5 py-1.5">
                <dt className="text-fg3">Experience</dt>
                <dd className="font-semibold text-fg">{yearsLabel(tech.years)}</dd>
              </div>
            )}
            {tech.jobs !== undefined && (
              <div className="rounded-lg bg-surface2/70 px-2.5 py-1.5">
                <dt className="text-fg3">Jobs done</dt>
                <dd className="font-semibold text-fg">{numberFormat.format(tech.jobs)}</dd>
              </div>
            )}
          </dl>
        )}
        {tech.specialties.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialties">
            {tech.specialties.map((s) => (
              <li key={s}>
                <Chip tone="accent">{s}</Chip>
              </li>
            ))}
          </ul>
        )}
        {tech.languages.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-fg3">
            <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="sr-only">Languages: </span>
            {tech.languages.join(', ')}
          </p>
        )}
        <div className="mt-auto pt-4">
          {/* The ::after covers the whole card, so clicking anywhere on it toggles the profile. */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`tech-panel-${tech.id}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent coarse:min-h-11"
          >
            {open ? 'Hide profile' : 'View profile'}
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
            <span className="sr-only">of {tech.name}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function TechnicianDetail({ tech, onClose }: { tech: Technician; onClose: () => void }) {
  const site = useSite();
  const first = firstName(tech.name);
  return (
    <section
      id={`tech-panel-${tech.id}`}
      aria-label={`${tech.name} profile`}
      className="glass-strong relative grid gap-6 rounded-3xl p-5 sm:p-7 md:grid-cols-[220px_minmax(0,1fr)]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${tech.name} profile`}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-fg2 transition hover:text-fg coarse:h-11 coarse:w-11"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <Photo src={tech.image} alt={`${tech.name}, ${tech.role}`} icon={User} className="hidden aspect-square w-full rounded-2xl md:flex" />
      <div className="min-w-0">
        <p className="eyebrow">{tech.role}</p>
        <h3 className="mt-2 pr-10 font-display text-2xl font-bold tracking-tight text-ink">{tech.name}</h3>
        {(tech.rating !== undefined || tech.years !== null || tech.jobs !== undefined) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg2">
            {tech.rating !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <Stars rating={tech.rating} />
                <span className="font-semibold text-fg">{tech.rating.toFixed(1)}</span>
              </span>
            )}
            {(tech.years !== null || tech.jobs !== undefined) && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-fg3" aria-hidden />
                {[tech.years !== null ? yearsLabel(tech.years) : '', tech.jobs !== undefined ? `${numberFormat.format(tech.jobs)} jobs` : '']
                  .filter(Boolean)
                  .join(', ')}
              </span>
            )}
          </div>
        )}
        {tech.bio && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg2">{tech.bio}</p>}

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <DetailList title="Certifications" Icon={BadgeCheck} items={tech.certifications} empty="Workshop trained" />
          <DetailList title="Makes" Icon={Car} items={tech.makes} />
          <DetailList title="Languages" Icon={Languages} items={tech.languages} />
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link to={`${sitePath(site, 'book')}?tech=${encodeURIComponent(tech.id)}`} className="btn-ink">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Book with {first}
          </Link>
          <button type="button" onClick={onClose} className="btn-outline">
            Close
          </button>
        </div>
      </div>
    </section>
  );
}

function DetailList({ title, Icon, items, empty }: { title: string; Icon: typeof Car; items: string[]; empty?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg3">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
        {title}
      </h4>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item}>
              <Chip>{item}</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-fg2">{empty}</p>
      )}
    </div>
  );
}
