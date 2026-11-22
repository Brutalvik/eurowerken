import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PenLine, Search, SlidersHorizontal, Star } from 'lucide-react';
import { Stars } from '@/components/ui';
import { REVIEWS, REVIEW_SUMMARY, VEHICLE_MAKES } from '@/data/catalog';
import type { Review } from '@/data/catalog';
import { useSite } from '@/site/SiteContext';
import { ReviewCard } from '@/pages/reviews/ReviewCard';
import { WriteReviewDialog } from '@/pages/reviews/WriteReviewDialog';

const PER_PAGE = 3;
const SERVICE_TYPES: Review['serviceType'][] = ['Maintenance & Oil Change', 'Brake Service', 'Engine Diagnostics', 'Parts Purchase'];
const BRANDS = Object.keys(VEHICLE_MAKES);
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
  { value: 'helpful', label: 'Most helpful' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

interface Filters {
  query: string;
  rating: number | null;
  services: Review['serviceType'][];
  brand: string;
}
const NO_FILTERS: Filters = { query: '', rating: null, services: [], brand: '' };

/** "Mercedes-Benz" also matches "Mercedes C 63". */
function matchesBrand(car: string, brand: string): boolean {
  const c = car.toLowerCase();
  return c.includes(brand.toLowerCase()) || c.includes(brand.split('-')[0]!.toLowerCase());
}

function applyFilters(reviews: Review[], f: Filters, sort: Sort): Review[] {
  const q = f.query.trim().toLowerCase();
  const out = reviews.filter(
    (r) =>
      (!q || [r.author, r.title, r.body, r.car].some((s) => s.toLowerCase().includes(q))) &&
      (f.rating === null || r.rating === f.rating) &&
      (f.services.length === 0 || f.services.includes(r.serviceType)) &&
      (!f.brand || matchesBrand(r.car, f.brand)),
  );
  const by: Record<Sort, (a: Review, b: Review) => number> = {
    recent: (a, b) => a.daysAgo - b.daysAgo,
    highest: (a, b) => b.rating - a.rating || a.daysAgo - b.daysAgo,
    lowest: (a, b) => a.rating - b.rating || a.daysAgo - b.daysAgo,
    helpful: (a, b) => b.helpful - a.helpful,
  };
  return out.sort(by[sort]);
}

export function ReviewsPage() {
  const site = useSite();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [voted, setVoted] = useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const writeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLHeadingElement>(null);

  const results = useMemo(() => applyFilters(REVIEWS, filters, sort), [filters, sort]);
  const pages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const current = Math.min(page, pages);
  const shown = results.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function goTo(p: number) {
    setPage(p);
    listRef.current?.scrollIntoView({ block: 'start' });
  }

  function closeDialog() {
    setWriting(false);
    writeRef.current?.focus();
  }

  const activeCount = (filters.query ? 1 : 0) + (filters.rating !== null ? 1 : 0) + filters.services.length + (filters.brand ? 1 : 0);

  return (
    <div className="container-site py-8 sm:py-12">
      {/* Header */}
      <section className="glass flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Customer Reviews</h1>
          <p className="mt-2 text-sm text-fg2">Read what our customers are saying about our services and parts.</p>
        </div>
        <button ref={writeRef} type="button" onClick={() => setWriting(true)} className="btn-ink shrink-0">
          <PenLine className="h-4 w-4" aria-hidden />
          Write a Review
        </button>
      </section>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        <aside className="space-y-6">
          <RatingSummary />

          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="review-filters"
            className="btn-outline w-full lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {activeCount > 0 && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-bg">{activeCount}</span>
            )}
          </button>

          <section
            id="review-filters"
            aria-label="Filters"
            className={`glass rounded-2xl p-5 ${filtersOpen ? 'block' : 'hidden'} lg:block`}
          >
            <FilterPanel filters={filters} update={update} clear={() => update(NO_FILTERS)} />
          </section>
        </aside>

        <section aria-labelledby="recent-reviews" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="recent-reviews" ref={listRef} className="scroll-mt-24 font-display text-xl font-semibold text-fg">
              Recent Reviews
            </h2>
            <div className="flex items-center gap-2">
              <label htmlFor="review-sort" className="text-xs text-fg3">
                Sort by
              </label>
              <select
                id="review-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as Sort);
                  setPage(1);
                }}
                className="input w-auto py-2 pr-8 font-semibold"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {results.length} review{results.length === 1 ? '' : 's'} found
          </p>

          {shown.length === 0 ? (
            <div className="glass mt-5 rounded-2xl p-8 text-center">
              <p className="font-semibold text-fg">No reviews match these filters</p>
              <p className="mt-1 text-sm text-fg2">Try another rating or clear the filters.</p>
              <button type="button" onClick={() => update(NO_FILTERS)} className="btn-outline mt-5">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {shown.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  workshopName={site.display_name}
                  voted={voted.has(r.id)}
                  onHelpful={() => setVoted((v) => new Set(v).add(r.id))}
                />
              ))}
            </div>
          )}

          {pages > 1 && <Pagination page={current} pages={pages} onPage={goTo} />}
        </section>
      </div>

      {writing && <WriteReviewDialog workshopName={site.display_name} onClose={closeDialog} />}
    </div>
  );
}

function RatingSummary() {
  const s = REVIEW_SUMMARY;
  const levels = [5, 4, 3, 2, 1] as const;
  return (
    <section aria-labelledby="overall-rating" className="glass rounded-2xl p-5 sm:p-6">
      <h2 id="overall-rating" className="font-semibold text-fg">
        Overall Rating
      </h2>
      <div className="mt-4 flex items-center gap-5">
        <div className="shrink-0 text-center">
          <p className="font-display text-5xl font-bold tracking-tight text-fg">{s.average.toFixed(1)}</p>
          <div className="mt-1">
            <Stars rating={s.average} />
          </div>
          <p className="mt-1 text-[11px] text-fg3">Based on {s.total.toLocaleString('en-CA')} reviews</p>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5" aria-label="Rating distribution">
          {levels.map((n) => {
            const count = s.distribution[n];
            const pct = Math.round((count / s.total) * 100);
            return (
              <li key={n} className="flex items-center gap-2 text-xs text-fg3">
                <span className="w-2 text-fg2">{n}</span>
                <span className="sr-only">
                  stars: {count} reviews ({pct}%)
                </span>
                <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                  <span className="block h-full rounded-full bg-warn" style={{ width: `${pct}%` }} />
                </span>
                <span aria-hidden className="w-10 text-right tabular-nums">
                  {count.toLocaleString('en-CA')}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <dl className="mt-5 space-y-3 border-t border-line pt-5">
        {s.categories.map((c) => (
          <div key={c.label} className="flex items-center justify-between text-sm">
            <dt className="text-fg2">{c.label}</dt>
            <dd className="flex items-center gap-1 font-semibold text-fg">
              {c.score.toFixed(1)}
              <Star className="h-3.5 w-3.5 fill-warn text-warn" aria-hidden />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FilterPanel({ filters, update, clear }: { filters: Filters; update: (p: Partial<Filters>) => void; clear: () => void }) {
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition coarse:min-h-11 ${
      active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-fg2 hover:text-fg'
    }`;

  function toggleService(s: Review['serviceType']) {
    const has = filters.services.includes(s);
    update({ services: has ? filters.services.filter((x) => x !== s) : [...filters.services, s] });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-fg">Filters</h2>
        <button type="button" onClick={clear} className="rounded-md px-1 text-xs font-medium text-fg3 hover:text-fg coarse:min-h-11">
          Clear all
        </button>
      </div>

      <div className="relative mt-4">
        <label htmlFor="review-search" className="sr-only">
          Search reviews
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg3" aria-hidden />
        <input
          id="review-search"
          type="search"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search reviews..."
          className="input pl-10"
        />
      </div>

      <fieldset className="mt-5">
        <legend className="label">Rating</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filters.rating === null} onClick={() => update({ rating: null })} className={chip(filters.rating === null)}>
            All
          </button>
          {[5, 4, 3, 2, 1].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={filters.rating === n}
              aria-label={`${n} stars`}
              onClick={() => update({ rating: n })}
              className={chip(filters.rating === n)}
            >
              {n}
              <Star className="h-3 w-3 fill-warn text-warn" aria-hidden />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="label">Service type</legend>
        <div className="space-y-1">
          <CheckRow label="All Services" checked={filters.services.length === 0} onChange={() => update({ services: [] })} />
          {SERVICE_TYPES.map((s) => (
            <CheckRow key={s} label={s} checked={filters.services.includes(s)} onChange={() => toggleService(s)} />
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="review-brand" className="label">
          Car brand
        </label>
        <select id="review-brand" value={filters.brand} onChange={(e) => update({ brand: e.target.value })} className="input">
          <option value="">All brands</option>
          {BRANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1 text-sm text-fg2 hover:text-fg coarse:min-h-11">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 rounded border-line accent-accent" />
      {label}
    </label>
  );
}

/** Page numbers with gaps, for example 1 2 3 ... 12. */
function pageList(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const base = 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition coarse:h-11 coarse:min-w-11';
  return (
    <nav aria-label="Review pages" className="mt-8 flex items-center justify-center gap-1">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page" className={`${base} text-fg2 hover:bg-surface2 disabled:opacity-40`}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      {pageList(page, pages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-fg3" aria-hidden>
            ...
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={`${base} ${p === page ? 'bg-ink text-bg' : 'text-fg2 hover:bg-surface2'}`}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page === pages} aria-label="Next page" className={`${base} text-fg2 hover:bg-surface2 disabled:opacity-40`}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
