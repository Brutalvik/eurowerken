import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Heart, PackageSearch, Plus, ShieldCheck, ShoppingCart, Store, ThumbsUp, Truck } from 'lucide-react';
import { useParts, usePart } from '@/api/catalogue';
import type { Part } from '@/api/catalogue';
import { Photo } from '@/components/Photo';
import { Breadcrumbs, LoadError, Pill, QuantityStepper, Stars } from '@/components/ui';
import { useCart } from '@/cart/CartContext';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { readVehicle, vehicleLabel, vehicleQuery } from './vehicle';
import type { Vehicle } from './vehicle';

const MAX_QTY = 20;

/** Sample reviews until reviews come from the backend. */
const SAMPLE_REVIEWS = [
  {
    name: 'Michael T.',
    date: 'Oct 12, 2026',
    rating: 5,
    title: 'Perfect fit, exactly like OEM',
    text: 'Installed this along with new pads. Fitment was spot on, exactly like the original part, and the quality is obvious the moment you unbox it.',
    helpful: 12,
  },
  {
    name: 'Sarah J.',
    date: 'Sep 28, 2026',
    rating: 4,
    title: 'Great quality, quick delivery',
    text: 'Arrived two days after ordering and the workshop fitted it the same week. Took a short while to bed in, but it has been faultless since.',
    helpful: 5,
  },
];

/** Share of reviews per star (5 down to 1) for the summary chart. */
const DISTRIBUTION = [0.78, 0.14, 0.05, 0.02, 0.01];

export function PartDetailsPage() {
  const site = useSite();
  const { partSlug } = useParams();
  const [params] = useSearchParams();
  const { data: part, loading, error, retry } = usePart(partSlug);
  const vehicle = readVehicle(params);

  if (loading) {
    return (
      <div className="container-site py-10" aria-busy="true">
        <p className="sr-only" aria-live="polite">
          Loading part
        </p>
        <div aria-hidden className="glass grid animate-pulse gap-8 rounded-3xl p-4 motion-reduce:animate-none sm:p-6 lg:grid-cols-2 lg:p-8">
          <span className="aspect-square w-full rounded-2xl bg-surface2 sm:aspect-[4/3]" />
          <span className="flex flex-col gap-4">
            <span className="h-5 w-32 rounded bg-surface2" />
            <span className="h-8 w-4/5 rounded bg-surface2" />
            <span className="h-4 w-1/2 rounded bg-surface2" />
            <span className="h-32 w-full rounded-2xl bg-surface2" />
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-site py-20">
        <LoadError what="part" onRetry={retry} className="mx-auto max-w-lg" />
      </div>
    );
  }

  if (!part) {
    return (
      <div className="container-site py-20">
        <div className="glass mx-auto max-w-lg rounded-3xl px-6 py-14 text-center">
          <PackageSearch className="mx-auto h-10 w-10 text-fg3" aria-hidden />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Part not found</h1>
          <p className="mt-2 text-sm text-fg2">This part may no longer be available, or the link is incomplete.</p>
          <Link to={`${sitePath(site, 'parts')}${vehicleQuery(vehicle)}`} className="btn-ink mt-8">
            Back to the Parts Shop
          </Link>
        </div>
      </div>
    );
  }

  const shopHref = `${sitePath(site, 'parts')}${vehicleQuery(vehicle)}`;
  const categoryHref = `${sitePath(site, 'parts')}?${new URLSearchParams([
    ...(vehicle ? [['year', vehicle.year], ['make', vehicle.make], ['model', vehicle.model]] : []),
    ['cat', part.category],
  ]).toString()}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Parts Shop', to: shopHref },
          { label: part.category, to: categoryHref },
          { label: part.name },
        ]}
      />
      {/* key: reset gallery, quantity and messages when moving to another part. */}
      <div key={part.id} className="container-site space-y-12 pb-20 pt-6 sm:space-y-16">
        <section className="glass rounded-3xl p-4 sm:p-6 lg:p-8">
          <FitmentBar part={part} vehicle={vehicle} shopHref={shopHref} />
          <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
            <Gallery part={part} />
            <BuyBox part={part} />
          </div>
        </section>
        <InfoTabs part={part} />
        <BoughtTogether part={part} vehicle={vehicle} />
        {hasReviews(part) && <ReviewsSection part={part} />}
      </div>
    </>
  );
}

function FitmentBar({ part, vehicle, shopHref }: { part: Part; vehicle: Vehicle | null; shopHref: string }) {
  const title = part.fitment === 'universal' ? 'Universal fit' : 'Exact fit guaranteed';
  const text =
    part.fitment === 'universal'
      ? 'Fits a wide range of vehicles. Ask us to confirm before ordering.'
      : vehicle
        ? `Fits your ${vehicleLabel(vehicle)}`
        : 'Select your vehicle in the Parts Shop to confirm the fit.';
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{title}</p>
          <p className="text-sm font-semibold text-fg">{text}</p>
        </div>
      </div>
      <Link to={shopHref} className="btn-outline self-start px-4 py-2 text-xs sm:self-auto">
        {vehicle ? 'Change vehicle' : 'Select vehicle'}
      </Link>
    </div>
  );
}

function Gallery({ part }: { part: Part }) {
  const [index, setIndex] = useState(0);
  const [favourite, setFavourite] = useState(false);
  const images = part.images;
  const current = images[index] ?? images[0];
  const count = Math.max(1, images.length);
  return (
    <div className="min-w-0">
      <div className="glass relative overflow-hidden rounded-2xl">
        <Photo
          src={current}
          alt={`${part.name}, photo ${Math.min(index + 1, count)} of ${count}`}
          icon={PackageSearch}
          label={images.length === 0 ? 'Photo coming soon' : undefined}
          fit="contain"
          className="aspect-square w-full sm:aspect-[4/3]"
        />
        <button
          type="button"
          onClick={() => setFavourite((f) => !f)}
          aria-pressed={favourite}
          aria-label={favourite ? 'Remove from favourites' : 'Save to favourites'}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-fg3 backdrop-blur transition hover:text-bad coarse:h-11 coarse:w-11"
        >
          <Heart className={`h-4 w-4 ${favourite ? 'fill-bad text-bad' : ''}`} aria-hidden />
        </button>
      </div>
      {images.length > 1 && (
        <ul className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1" aria-label="Photos">
          {images.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={i === index}
                className={`block overflow-hidden rounded-xl border-2 transition ${i === index ? 'border-ink' : 'border-line hover:border-fg3'}`}
              >
                <Photo src={url} alt="" icon={PackageSearch} fit="contain" className="h-16 w-16 bg-surface sm:h-20 sm:w-20" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function stockPill(stock: number) {
  if (stock <= 0) return <Pill tone="bad">Out of stock</Pill>;
  if (stock <= 5) return <Pill tone="warn">Only {stock} left</Pill>;
  return <Pill tone="ok">In stock</Pill>;
}

function BuyBox({ part }: { part: Part }) {
  const site = useSite();
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<number | null>(null);
  const maxQty = Math.max(1, Math.min(MAX_QTY, part.stock));
  const outOfStock = part.stock <= 0;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        <Pill tone="ink">{part.quality} part</Pill>
        {stockPill(part.stock)}
      </div>
      <h1 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">{part.name}</h1>
      {(hasReviews(part) || part.partNumber || part.brand) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg2">
          {hasReviews(part) && (
            <>
              <span className="flex items-center gap-1.5">
                <Stars rating={part.rating ?? 0} />
                <a href="#reviews" className="hover:text-fg hover:underline">
                  {part.rating} ({part.reviewCount} reviews)
                </a>
              </span>
              <span className="text-line" aria-hidden>
                |
              </span>
            </>
          )}
          {part.brand && <span className="font-medium text-fg">{part.brand}</span>}
          {part.brand && part.partNumber && (
            <span className="text-line" aria-hidden>
              |
            </span>
          )}
          {part.partNumber && (
            <span>
              Part #: <span className="font-medium text-fg">{part.partNumber}</span>
            </span>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-surface2/60 p-4 sm:p-5">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-display text-3xl font-bold text-accent">
            {part.compareAt && <span className="sr-only">Now </span>}
            {formatMoney(part.price)}
          </span>
          {part.compareAt && (
            <span className="text-base text-fg3 line-through">
              <span className="sr-only">Was </span>
              {formatMoney(part.compareAt)}
            </span>
          )}
        </p>
        {part.summary && <p className="mt-1 text-xs text-fg3">{part.summary}</p>}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <QuantityStepper value={qty} onChange={(v) => setQty(Math.min(maxQty, Math.max(1, v)))} max={maxQty} />
          <button
            type="button"
            disabled={outOfStock}
            onClick={() => {
              add(part.id, qty);
              setAdded(qty);
            }}
            className="btn-ink flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {outOfStock ? 'Out of stock' : 'Add to Cart'}
          </button>
        </div>
        <div role="status" className="empty:hidden">
          {added !== null && (
            <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Added {added} to your cart.
              <Link to={sitePath(site, 'cart')} className="font-semibold underline coarse:inline-flex coarse:min-h-11 coarse:items-center">
                View cart
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-fg2" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">Free Delivery</p>
            <p className="text-xs text-fg3">Free standard delivery in 3 to 5 business days.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Store className="mt-0.5 h-5 w-5 shrink-0 text-fg2" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-fg">In-Store Pickup</p>
            <p className="text-xs text-fg3">
              {outOfStock ? 'Ask us when it is back in stock' : 'Usually ready the next business day'} at {site.display_name}.
            </p>
          </div>
        </div>
      </div>

      {part.specs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-fg">Quick Specifications</h2>
          <dl className="mt-2 divide-y divide-line text-sm">
            {part.specs.map((s) => (
              <div key={s.label} className="flex justify-between gap-4 py-2">
                <dt className="text-fg3">{s.label}</dt>
                <dd className="text-right font-medium text-fg">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// Tabs ------------------------------------------------------------------------------------

const ALL_TABS = ['Description', 'Technical Specs', 'OEM Cross Reference', 'Warranty'] as const;
type Tab = (typeof ALL_TABS)[number];

function hasReviews(part: Part): boolean {
  return part.rating !== undefined && (part.reviewCount ?? 0) > 0;
}

function InfoTabs({ part }: { part: Part }) {
  const base = useId();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Tabs the workshop has filled in; Description and Technical Specs are always shown.
  const TABS = ALL_TABS.filter(
    (t): t is Tab => (t !== 'OEM Cross Reference' || part.oemReferences.length > 0) && (t !== 'Warranty' || part.warranty !== ''),
  );
  const facts = [
    { label: 'Brand', value: part.brand },
    { label: 'Part number', value: part.partNumber },
    { label: 'Quality', value: part.quality },
    ...part.specs,
  ].filter((s) => s.value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = TABS.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="glass overflow-hidden rounded-3xl" aria-label="Product information">
      <div role="tablist" aria-label="Product information" onKeyDown={onKeyDown} className="no-scrollbar flex overflow-x-auto border-b border-line px-2 sm:px-4">
        {TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold transition ${
              i === active ? 'border-ink text-fg' : 'border-transparent text-fg3 hover:text-fg'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {TABS.map((t, i) => (
        <div
          key={t}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          hidden={i !== active}
          tabIndex={0}
          className="p-5 text-sm leading-relaxed text-fg2 outline-none sm:p-8"
        >
          {t === 'Description' && (
            <>
              <h2 className="font-display text-lg font-semibold text-fg">Product Description</h2>
              {part.description.length === 0 && <p className="mt-3">{part.summary || 'Ask us for details about this part.'}</p>}
              {part.description.map((d) => (
                <p key={d} className="mt-3">
                  {d}
                </p>
              ))}
              {part.features.length > 0 && (
                <>
                  <h3 className="mt-6 font-semibold text-fg">Key Features</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    {part.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {t === 'Technical Specs' && (
            <dl className="max-w-xl divide-y divide-line">
              {facts.map((s) => (
                <div key={s.label} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-fg3">{s.label}</dt>
                  <dd className="text-right font-medium text-fg">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {t === 'OEM Cross Reference' && (
            <>
              <p>This part replaces the following manufacturer part numbers:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {part.oemReferences.map((r) => (
                  <li key={r} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs text-fg">
                    {r}
                  </li>
                ))}
              </ul>
            </>
          )}
          {t === 'Warranty' && (
            <>
              <p className="font-medium text-fg">{part.warranty}</p>
              <p className="mt-3">
                Fitted by our workshop, the warranty covers parts and labour. Uninstalled parts can be returned within 90 days in their original
                packaging.
              </p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

// Frequently bought together ---------------------------------------------------------------

/** Other in-stock parts in the same category (a simple rule until order history can suggest better). */
function relatedParts(part: Part, all: Part[], count = 2): Part[] {
  return all.filter((p) => p.id !== part.id && p.category === part.category && p.stock > 0).slice(0, count);
}

function BoughtTogether({ part, vehicle }: { part: Part; vehicle: Vehicle | null }) {
  const { data } = useParts();
  const related = useMemo(() => (data ? relatedParts(part, data) : []), [data, part]);
  if (related.length === 0) return null;
  // key: start with every item ticked again when the suggestions change.
  return <Bundle key={related.map((p) => p.id).join(',')} items={[part, ...related]} vehicle={vehicle} />;
}

function Bundle({ items, vehicle }: { items: Part[]; vehicle: Vehicle | null }) {
  const site = useSite();
  const { add } = useCart();
  const [checked, setChecked] = useState<Set<string>>(() => new Set(items.map((p) => p.id)));
  const [added, setAdded] = useState(false);

  const selected = items.filter((p) => checked.has(p.id));
  const total = selected.reduce((n, p) => n + p.price, 0);

  function toggle(id: string) {
    setAdded(false);
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-labelledby="fbt-title">
      <h2 id="fbt-title" className="font-display text-xl font-bold text-ink sm:text-2xl">
        Frequently Bought Together
      </h2>
      <div className="glass mt-5 grid gap-6 rounded-3xl p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <ul className="grid gap-4 sm:flex sm:flex-wrap sm:items-center">
          {items.map((p, i) => (
            <li key={p.id} className="flex items-center gap-4 sm:gap-3">
              {i > 0 && <Plus className="hidden h-4 w-4 shrink-0 text-fg3 sm:block" aria-hidden />}
              <div className="flex items-center gap-3 sm:w-36 sm:flex-col sm:text-center">
                <Link to={`${sitePath(site, `parts/${p.slug}`)}${vehicleQuery(vehicle)}`} tabIndex={-1} aria-hidden className="shrink-0">
                  <Photo src={p.image} alt="" icon={PackageSearch} fit="contain" className="h-16 w-16 rounded-xl border border-line bg-surface sm:h-20 sm:w-20" />
                </Link>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-fg2 sm:flex-col sm:items-center">
                  <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent coarse:h-5 coarse:w-5" />
                  <span>
                    <span className="block font-medium text-fg">{i === 0 ? `This item: ${p.name}` : p.name}</span>
                    <span className="mt-0.5 block font-semibold text-fg">{formatMoney(p.price)}</span>
                  </span>
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl border border-line bg-surface2/60 p-5 lg:w-64">
          <p className="text-xs text-fg3">
            Total price for {selected.length} {selected.length === 1 ? 'item' : 'items'}:
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-fg">{formatMoney(total)}</p>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              for (const p of selected) add(p.id, 1);
              setAdded(true);
            }}
            className="btn-ink mt-4 w-full disabled:opacity-50"
          >
            Add Bundle to Cart
          </button>
          <div role="status" className="empty:hidden">
            {added && (
              <p className="mt-3 text-xs text-ok">
                Bundle added.{' '}
                <Link to={sitePath(site, 'cart')} className="font-semibold underline">
                  View cart
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Reviews ----------------------------------------------------------------------------------

function distribution(total: number): number[] {
  const counts = DISTRIBUTION.map((share) => Math.floor(total * share));
  counts[0] = (counts[0] ?? 0) + total - counts.reduce((a, b) => a + b, 0);
  return counts;
}

function ReviewsSection({ part }: { part: Part }) {
  const total = part.reviewCount ?? 0;
  const rating = part.rating ?? 0;
  const counts = distribution(total);
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-24">
      <h2 id="reviews-title" className="font-display text-xl font-bold text-ink sm:text-2xl">
        Customer Reviews
      </h2>
      <div className="mt-5 grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="glass self-start rounded-3xl p-6">
          <div className="flex items-end gap-3">
            <p className="font-display text-5xl font-bold text-fg">{rating.toFixed(1)}</p>
            <div className="pb-1">
              <Stars rating={rating} />
              <p className="mt-1 text-xs text-fg3">Based on {total} reviews</p>
            </div>
          </div>
          <ul className="mt-6 space-y-2" aria-label="Ratings breakdown">
            {counts.map((c, i) => {
              const stars = 5 - i;
              const pct = total ? (c / total) * 100 : 0;
              return (
                <li key={stars} className="flex items-center gap-3 text-xs text-fg2">
                  <span className="w-12 shrink-0 whitespace-nowrap" aria-hidden>
                    {stars} star
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2" aria-hidden>
                    <span className="block h-full rounded-full bg-warn" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums" aria-hidden>
                    {c}
                  </span>
                  <span className="sr-only">
                    {stars} {stars === 1 ? 'star' : 'stars'}: {c} reviews
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <ul className="space-y-4">
          {SAMPLE_REVIEWS.map((r) => (
            <li key={r.name} className="glass rounded-3xl p-5 sm:p-6">
              <article>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent" aria-hidden>
                      {r.name[0]}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-fg">{r.name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={r.rating} />
                        <Pill tone="ok">Verified buyer</Pill>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-fg3">{r.date}</p>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-fg">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg2">{r.text}</p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-fg3">
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                  {r.helpful} people found this helpful
                </p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
