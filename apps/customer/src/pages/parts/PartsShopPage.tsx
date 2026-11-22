import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  PackageSearch,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  X,
} from 'lucide-react';
import { PART_QUALITIES as QUALITIES } from '@eurowerken/shared';
import { useParts } from '@/api/catalogue';
import type { Part, Quality } from '@/api/catalogue';
import { Photo } from '@/components/Photo';
import { EmptyCatalogue, LoadError, PageHero, SkeletonGrid, Stars } from '@/components/ui';
import { VEHICLE_MAKES, VEHICLE_YEARS } from '@/data/catalog';
import { useCart } from '@/cart/CartContext';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { readVehicle, vehicleLabel, vehicleQuery } from './vehicle';
import type { Vehicle } from './vehicle';

const PAGE_SIZE = 6;
const YEAR_SELECT_ID = 'vehicle-year';

const SORTS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
] as const;
type SortId = (typeof SORTS)[number]['id'];

/** Filters as read from the URL (?q=&cat=&quality=&min=&max=&sort=&page=). */
interface Filters {
  q: string;
  categories: string[];
  qualities: Quality[];
  min: string;
  max: string;
  sort: SortId;
}

function readFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    categories: params.getAll('cat'),
    qualities: params.getAll('quality').filter((q): q is Quality => (QUALITIES as readonly string[]).includes(q)),
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    sort: SORTS.some((s) => s.id === sort) ? (sort as SortId) : 'recommended',
  };
}

function applyFilters(parts: Part[], f: Filters): Part[] {
  const q = f.q.trim().toLowerCase();
  const min = f.min === '' ? null : Number(f.min);
  const max = f.max === '' ? null : Number(f.max);
  const out = parts.filter(
    (p) =>
      (!q || `${p.name} ${p.brand} ${p.partNumber} ${p.category}`.toLowerCase().includes(q)) &&
      (f.categories.length === 0 || f.categories.includes(p.category)) &&
      (f.qualities.length === 0 || f.qualities.includes(p.quality)) &&
      (min === null || Number.isNaN(min) || p.price >= min) &&
      (max === null || Number.isNaN(max) || p.price <= max),
  );
  if (f.sort === 'price-asc') out.sort((a, b) => a.price - b.price);
  else if (f.sort === 'price-desc') out.sort((a, b) => b.price - a.price);
  return out;
}

/** Categories the workshop's parts use, alphabetically. */
function categoriesOf(parts: Part[]): string[] {
  return [...new Set(parts.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const NO_PARTS: Part[] = [];

export function PartsShopPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const vehicle = readVehicle(params);
  const catalogue = useParts();
  const parts = catalogue.data ?? NO_PARTS;
  const categories = useMemo(() => categoriesOf(parts), [parts]);
  const results = useMemo(() => applyFilters(parts, readFilters(params)), [parts, params]);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.get('page')) || 1));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [panelOpen, setPanelOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const filterToggleRef = useRef<HTMLButtonElement>(null);

  function closePanel() {
    setPanelOpen(false);
    filterToggleRef.current?.focus();
  }

  /** Change the URL params; any filter change goes back to page 1. */
  function update(change: (p: URLSearchParams) => void, keepPage = false) {
    const next = new URLSearchParams(params);
    change(next);
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  }

  function goToPage(n: number) {
    update((p) => (n <= 1 ? p.delete('page') : p.set('page', String(n))), true);
    resultsRef.current?.scrollIntoView({ block: 'start' });
  }

  function setVehicle(v: Vehicle) {
    update((p) => {
      p.set('year', v.year);
      p.set('make', v.make);
      p.set('model', v.model);
    });
  }

  function changeVehicle() {
    const el = document.getElementById(YEAR_SELECT_ID);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }

  return (
    <>
      <PageHero
        title={
          <>
            Premium Parts for
            <br className="hidden sm:block" /> Premium Performance
          </>
        }
        subtitle="Find exact-fit OEM and high-performance aftermarket parts for your European vehicle. Fast shipping and guaranteed fitment."
      >
        <VehicleSelector key={vehicle ? vehicleLabel(vehicle) : 'none'} initial={vehicle} onSubmit={setVehicle} />
      </PageHero>

      <div className="container-site py-10 sm:py-14">
        {catalogue.loading ? (
          <SkeletonGrid label="Loading parts" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" card="h-80" />
        ) : catalogue.error ? (
          <LoadError what="parts catalogue" onRetry={catalogue.retry} />
        ) : parts.length === 0 ? (
          <EmptyCatalogue
            Icon={PackageSearch}
            title="The parts shop is not open yet"
            text="This workshop has not listed its parts online yet. Call us or visit the workshop and we will find the right part for your car."
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
            <aside aria-label="Filters" className="hidden lg:block">
              <div className="glass sticky top-24 rounded-2xl p-5">
                <FilterControls idPrefix="side" filters={filters} categories={categories} update={update} />
              </div>
            </aside>

            <div ref={resultsRef} className="min-w-0 scroll-mt-24">
              <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Car className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Viewing parts for</p>
                    <p className="truncate text-sm font-semibold text-fg">{vehicle ? vehicleLabel(vehicle) : 'All vehicles (select yours above)'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={changeVehicle}
                  className="self-start text-sm font-semibold text-accent hover:underline sm:self-auto coarse:min-h-11"
                >
                  {vehicle ? 'Change vehicle' : 'Select vehicle'}
                </button>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg2" aria-live="polite">
                  Showing <span className="font-semibold text-fg">{results.length}</span> {results.length === 1 ? 'result' : 'results'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    ref={filterToggleRef}
                    type="button"
                    onClick={() => setPanelOpen((o) => !o)}
                    aria-expanded={panelOpen}
                    aria-controls="filter-panel"
                    className="btn-outline px-3.5 py-2 lg:hidden"
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                    Filters
                    {activeFilterCount(filters) > 0 && (
                      <span className="rounded-full bg-accent/15 px-1.5 text-[11px] text-accent">{activeFilterCount(filters)}</span>
                    )}
                  </button>
                  <label htmlFor="sort" className="sr-only">
                    Sort by
                  </label>
                  <select
                    id="sort"
                    value={filters.sort}
                    onChange={(e) => update((p) => (e.target.value === 'recommended' ? p.delete('sort') : p.set('sort', e.target.value)))}
                    className="input w-auto py-2 pr-8"
                  >
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        Sort: {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {panelOpen && <FilterPanel filters={filters} categories={categories} update={update} onClose={closePanel} />}

              {shown.length === 0 ? (
                <div className="glass mt-6 rounded-2xl px-6 py-14 text-center">
                  <PackageSearch className="mx-auto h-10 w-10 text-fg3" aria-hidden />
                  <p className="mt-4 font-semibold text-fg">No parts match these filters</p>
                  <p className="mt-1 text-sm text-fg2">Try a different search, or reset the filters.</p>
                  <button type="button" onClick={() => update(clearFilters)} className="btn-outline mt-6">
                    Reset all filters
                  </button>
                </div>
              ) : (
                <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <PartCard part={p} vehicle={vehicle} />
                    </li>
                  ))}
                </ul>
              )}

              {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPage={goToPage} />}
            </div>
          </div>
        )}
      </div>

      <TrustRow />
    </>
  );
}

function clearFilters(p: URLSearchParams) {
  for (const k of ['q', 'cat', 'quality', 'min', 'max']) p.delete(k);
}

function activeFilterCount(f: Filters): number {
  return (f.q ? 1 : 0) + f.categories.length + f.qualities.length + (f.min ? 1 : 0) + (f.max ? 1 : 0);
}

// Vehicle selector ----------------------------------------------------------------

function VehicleSelector({ initial, onSubmit }: { initial: Vehicle | null; onSubmit: (v: Vehicle) => void }) {
  const [year, setYear] = useState(initial?.year ?? '');
  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [error, setError] = useState(false);
  const models = make ? (VEHICLE_MAKES[make] ?? []) : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!year || !make || !model) {
      setError(true);
      return;
    }
    setError(false);
    onSubmit({ year, make, model });
  }

  // Selects on the dark band: translucent fields with light text.
  const field =
    'w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 coarse:min-h-12 [&>option]:bg-surface [&>option]:text-fg';
  return (
    <form onSubmit={submit} noValidate aria-label="Find parts for your vehicle" className="glass-dark max-w-3xl rounded-2xl p-3 sm:p-4">
      <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <div>
          <label htmlFor={YEAR_SELECT_ID} className="sr-only">
            Year
          </label>
          <select id={YEAR_SELECT_ID} value={year} onChange={(e) => setYear(e.target.value)} className={field} aria-describedby={error ? 'vehicle-error' : undefined}>
            <option value="">Select year</option>
            {VEHICLE_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="vehicle-make" className="sr-only">
            Make
          </label>
          <select
            id="vehicle-make"
            value={make}
            onChange={(e) => {
              setMake(e.target.value);
              setModel('');
            }}
            className={field}
            aria-describedby={error ? 'vehicle-error' : undefined}
          >
            <option value="">Select make</option>
            {Object.keys(VEHICLE_MAKES).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="vehicle-model" className="sr-only">
            Model
          </label>
          <select
            id="vehicle-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={!make}
            className={`${field} disabled:opacity-50`}
            aria-describedby={error ? 'vehicle-error' : undefined}
          >
            <option value="">{make ? 'Select model' : 'Select make first'}</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-md shadow-accent/15 transition hover:opacity-90 coarse:min-h-12">
          <Search className="h-4 w-4" aria-hidden />
          Find Parts
        </button>
      </div>
      {error && (
        <p id="vehicle-error" role="alert" className="mt-2 px-1 text-xs text-white/80">
          Choose a year, make and model.
        </p>
      )}
    </form>
  );
}

// Filters -----------------------------------------------------------------------------

type Update = (change: (p: URLSearchParams) => void, keepPage?: boolean) => void;

function toggleValue(p: URLSearchParams, key: string, value: string) {
  const values = p.getAll(key);
  p.delete(key);
  const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  for (const v of next) p.append(key, v);
}

function setOrDelete(p: URLSearchParams, key: string, value: string) {
  if (value) p.set(key, value);
  else p.delete(key);
}

function FilterControls({
  idPrefix,
  filters,
  categories,
  update,
}: {
  idPrefix: string;
  filters: Filters;
  categories: string[];
  update: Update;
}) {
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-fg">Filters</h2>
        <button type="button" onClick={() => update(clearFilters)} className="text-xs font-semibold text-accent hover:underline coarse:min-h-11">
          Reset all
        </button>
      </div>

      <div className="relative">
        <label htmlFor={id('search')} className="sr-only">
          Search parts
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg3" aria-hidden />
        <input
          id={id('search')}
          type="search"
          value={filters.q}
          onChange={(e) => update((p) => setOrDelete(p, 'q', e.target.value))}
          placeholder="Search parts, numbers..."
          autoComplete="off"
          className="input pl-9"
        />
      </div>

      {categories.length > 0 && (
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-fg">Category</legend>
          <div className="mt-3 space-y-1">
            {categories.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-fg2 hover:text-fg coarse:min-h-11">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(c)}
                  onChange={() => update((p) => toggleValue(p, 'cat', c))}
                  className="h-4 w-4 rounded border-line accent-accent"
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-fg">Quality</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUALITIES.map((q) => {
            const on = filters.qualities.includes(q);
            return (
              <button
                key={q}
                type="button"
                aria-pressed={on}
                onClick={() => update((p) => toggleValue(p, 'quality', q))}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition coarse:min-h-11 ${
                  on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-fg2 hover:text-fg'
                }`}
              >
                {q}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-fg">Price range</legend>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={id('min')} className="sr-only">
            Minimum price
          </label>
          <input
            id={id('min')}
            type="number"
            inputMode="decimal"
            min={0}
            value={filters.min}
            onChange={(e) => update((p) => setOrDelete(p, 'min', e.target.value))}
            placeholder="$ Min"
            className="input min-w-0"
          />
          <span className="text-fg3" aria-hidden>
            -
          </span>
          <label htmlFor={id('max')} className="sr-only">
            Maximum price
          </label>
          <input
            id={id('max')}
            type="number"
            inputMode="decimal"
            min={0}
            value={filters.max}
            onChange={(e) => update((p) => setOrDelete(p, 'max', e.target.value))}
            placeholder="$ Max"
            className="input min-w-0"
          />
        </div>
      </fieldset>
    </div>
  );
}

/** Phones and tablets: the filters open in a panel under the toolbar. */
function FilterPanel({
  filters,
  categories,
  update,
  onClose,
}: {
  filters: Filters;
  categories: string[];
  update: Update;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus the first control when the panel opens; Escape closes it and returns to the toggle.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeRef.current();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div id="filter-panel" ref={panelRef} role="region" aria-label="Filters" className="glass-strong relative mt-4 rounded-2xl p-5 lg:hidden">
      <FilterControls idPrefix="panel" filters={filters} categories={categories} update={update} />
      <div className="mt-6 flex justify-end border-t border-line pt-4">
        <button type="button" onClick={onClose} className="btn-ink px-4 py-2">
          <X className="h-4 w-4" aria-hidden />
          Close filters
        </button>
      </div>
    </div>
  );
}

// Product card ------------------------------------------------------------------------

function PartCard({ part, vehicle }: { part: Part; vehicle: Vehicle | null }) {
  const site = useSite();
  const { add } = useCart();
  const [favourite, setFavourite] = useState(false);
  const [added, setAdded] = useState(false);
  const href = `${sitePath(site, `parts/${part.slug}`)}${vehicleQuery(vehicle)}`;

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 2000);
    return () => window.clearTimeout(t);
  }, [added]);

  return (
    <article className="glass glass-lift group relative flex h-full flex-col overflow-hidden rounded-2xl p-3">
      <div className="relative overflow-hidden rounded-xl bg-surface2/70">
        <Link to={href} tabIndex={-1} aria-hidden>
          <Photo
            src={part.image}
            alt=""
            icon={PackageSearch}
            fit="contain"
            className="aspect-[4/3] w-full transition duration-500 group-hover:scale-105"
          />
        </Link>
        <span
          className={`absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            part.fitment === 'guaranteed' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'
          }`}
        >
          {part.fitment === 'guaranteed' ? 'Guaranteed fit' : 'Universal fit'}
        </span>
        <button
          type="button"
          onClick={() => setFavourite((f) => !f)}
          aria-pressed={favourite}
          aria-label={favourite ? `Remove ${part.name} from favourites` : `Save ${part.name} to favourites`}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-fg3 backdrop-blur transition hover:text-bad coarse:h-11 coarse:w-11"
        >
          <Heart className={`h-4 w-4 ${favourite ? 'fill-bad text-bad' : ''}`} aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        <p className="text-[11px] text-fg3">{[part.quality, part.category].filter(Boolean).join(' \u00b7 ')}</p>
        <h3 className="mt-1 font-display text-sm font-semibold leading-snug text-fg sm:text-base">
          <Link to={href} className="hover:text-accent">
            {part.name}
          </Link>
        </h3>
        {part.rating !== undefined && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fg3">
            <Stars rating={part.rating} />
            <span>
              {part.rating} ({part.reviewCount ?? 0} reviews)
            </span>
          </div>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            {part.compareAt && (
              <p className="text-xs text-fg3 line-through">
                <span className="sr-only">Was </span>
                {formatMoney(part.compareAt)}
              </p>
            )}
            <p className="font-display text-lg font-bold text-fg">
              {part.compareAt && <span className="sr-only">Now </span>}
              {formatMoney(part.price)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              add(part.id);
              setAdded(true);
            }}
            disabled={part.stock <= 0}
            aria-label={`Add ${part.name} to cart`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition hover:bg-accent hover:text-accent-fg disabled:opacity-40 coarse:h-11 coarse:w-11"
          >
            {added ? <Check className="h-4 w-4" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <p className="sr-only" role="status">
          {added ? `${part.name} added to cart` : ''}
        </p>
      </div>
    </article>
  );
}

// Pagination ----------------------------------------------------------------------------

/** Page numbers to show, with null for a gap. */
function pageList(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push(null);
    out.push(n);
  });
  return out;
}

function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (n: number) => void }) {
  const labelId = useId();
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition coarse:h-11 coarse:min-w-11';
  return (
    <nav aria-labelledby={labelId} className="mt-10 flex justify-center">
      <h2 id={labelId} className="sr-only">
        Pages
      </h2>
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={`${btn} text-fg2 hover:bg-surface2 disabled:opacity-40`}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        </li>
        {pageList(page, pageCount).map((n, i) =>
          n === null ? (
            <li key={`gap-${i}`} className="px-1 text-fg3" aria-hidden>
              ...
            </li>
          ) : (
            <li key={n}>
              <button
                type="button"
                onClick={() => onPage(n)}
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Page ${n}`}
                className={`${btn} ${n === page ? 'bg-ink text-bg' : 'text-fg2 hover:bg-surface2'}`}
              >
                {n}
              </button>
            </li>
          ),
        )}
        <li>
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page" className={`${btn} text-fg2 hover:bg-surface2 disabled:opacity-40`}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </li>
      </ul>
    </nav>
  );
}

// Trust row ------------------------------------------------------------------------------

const TRUST = [
  { Icon: Truck, title: 'Free Shipping', text: 'Free standard delivery on every parts order across Canada.' },
  { Icon: ShieldCheck, title: 'Fitment Guarantee', text: 'Choose your vehicle and we guarantee the part fits, or your money back.' },
  { Icon: RotateCcw, title: '90-Day Returns', text: 'Hassle-free returns on uninstalled parts in their original packaging.' },
];

function TrustRow() {
  return (
    <section aria-label="Why buy parts here" className="border-t border-line bg-surface2/60">
      <ul className="container-site grid gap-8 py-14 text-center sm:grid-cols-3">
        {TRUST.map(({ Icon, title, text }) => (
          <li key={title}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-base font-semibold text-fg">{title}</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-fg2">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
