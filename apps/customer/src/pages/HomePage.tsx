import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  Car,
  CheckCircle2,
  ChevronRight,
  Gauge,
  PackageSearch,
  Quote,
  Receipt,
  ScanLine,
  ShieldCheck,
  Star,
  User,
  Wrench,
} from 'lucide-react';
import { Photo } from '@/components/Photo';
import { GARAGE_FEATURES, HERO_STATS, SERVICES, TECHNICIANS, TESTIMONIALS } from '@/data/landing';
import { sitePath, useSite } from '@/site/SiteContext';

const SERVICE_ICONS = [ScanLine, Gauge, CalendarCheck, Wrench];
const GARAGE_ICONS = [Car, ScanLine, Receipt];

export function HomePage() {
  return (
    <>
      <Hero />
      <QuickActions />
      <Services />
      <GaragePreview />
      <Technicians />
      <Testimonials />
      <CallToAction />
    </>
  );
}

/** Headline with the chosen word in the brand colour. */
function HeroTitle({ title, highlight }: { title: string; highlight: string | null }) {
  const at = highlight ? title.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, at)}
      <span className="bg-gradient-to-r from-ink via-accent to-accent bg-clip-text text-transparent">{highlight}</span>
      {title.slice(at + highlight.length)}
    </>
  );
}

function Hero() {
  const site = useSite();
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-surface2 via-bg to-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl"
      />
      <div className="container-site relative grid items-center gap-12 pb-24 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-32 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3.5 py-1.5 text-xs font-semibold text-accent sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {site.tagline ?? 'Premium European Auto Care'}
          </span>
          <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl xl:text-7xl">
            <HeroTitle title={site.hero_title ?? `Precision service at ${site.display_name}.`} highlight={site.hero_highlight} />
          </h1>
          {site.hero_subtitle && (
            <p className="mt-6 max-w-xl text-base leading-relaxed text-fg2 sm:text-lg">{site.hero_subtitle}</p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={sitePath(site, 'book')} className="btn-ink px-7 py-3.5 text-base">
              Book Service
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to={sitePath(site, 'track')} className="btn-outline px-7 py-3.5 text-base">
              Track Repair
            </Link>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-8">
            {HERO_STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-bold text-ink sm:text-3xl">{s.value}</dd>
                <dd className="mt-1 text-xs text-fg3">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-line/60 bg-surface shadow-2xl shadow-ink/10">
            <Photo name="hero-car" alt="A European sports car in the workshop" label="Hero photo: hero-car.jpg" icon={Car} className="h-full w-full" />
          </div>
          {/* Floating status cards from the design; tucked inside the frame on phones. */}
          <div className="absolute -top-5 right-3 w-52 rounded-2xl border border-line/70 bg-surface/95 p-3.5 shadow-xl backdrop-blur sm:-right-4 sm:w-60 sm:p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-fg3">Status Update</p>
                <p className="truncate text-sm font-semibold text-fg">Service Completed</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-ok" aria-hidden />
          </div>
          <div className="absolute -bottom-6 left-3 w-60 rounded-2xl border border-line/70 bg-surface/95 p-4 shadow-xl backdrop-blur sm:-left-6 sm:w-64">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-fg">Diagnostic Scan</p>
              <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Live</span>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-fg3">Engine Systems</dt>
                <dd className="font-medium text-ok">Optimal</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg3">Brake Pads</dt>
                <dd className="font-medium text-warn">Needs Attention</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickActions() {
  const site = useSite();
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState('');

  function onTrack(e: FormEvent) {
    e.preventDefault();
    const id = trackingId.trim();
    navigate(`${sitePath(site, 'track')}${id ? `?id=${encodeURIComponent(id)}` : ''}`);
  }

  const card = 'rounded-2xl border border-line bg-surface p-6 shadow-lg shadow-ink/5';
  return (
    <section aria-label="Quick actions" className="container-site relative z-10 -mt-12 grid gap-4 md:grid-cols-3 lg:-mt-16">
      <div className={card}>
        <IconBadge Icon={CalendarCheck} />
        <h2 className="mt-4 font-display text-lg font-semibold text-fg">Book Appointment</h2>
        <p className="mt-1.5 text-sm text-fg2">Pick a service, a time that suits you, and your preferred technician.</p>
        <Link to={sitePath(site, 'book')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline coarse:min-h-11">
          Schedule now <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <form onSubmit={onTrack} className={card}>
        <IconBadge Icon={ScanLine} />
        <h2 className="mt-4 font-display text-lg font-semibold text-fg">Track Repair</h2>
        <p className="mt-1.5 text-sm text-fg2">Enter your tracking ID to see live status, notes and photos.</p>
        <div className="mt-4 flex gap-2">
          <label htmlFor="quick-track" className="sr-only">
            Tracking ID
          </label>
          <input
            id="quick-track"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder="e.g. EW-82734"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg3 focus:border-accent coarse:min-h-12"
          />
          <button type="submit" aria-label="Track repair" className="btn-ink px-4 py-2.5">
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </form>
      <div className={card}>
        <IconBadge Icon={PackageSearch} />
        <h2 className="mt-4 font-display text-lg font-semibold text-fg">Shop OEM Parts</h2>
        <p className="mt-1.5 text-sm text-fg2">Genuine and OEM parts matched to your exact vehicle, with guaranteed fit.</p>
        <Link to={sitePath(site, 'parts')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline coarse:min-h-11">
          Browse catalogue <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function IconBadge({ Icon }: { Icon: typeof CalendarCheck }) {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

function SectionHeading({ eyebrow, title, text, center = true }: { eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-fg2">{text}</p>}
    </div>
  );
}

function Services() {
  const site = useSite();
  return (
    <section className="container-site py-20 sm:py-24">
      <SectionHeading
        eyebrow="Our Expertise"
        title="Comprehensive Care for European Vehicles"
        text="From routine maintenance to complex rebuilds, every job is done to manufacturer standards by specialists in your make."
      />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((s, i) => {
          const Icon = SERVICE_ICONS[i % SERVICE_ICONS.length]!;
          return (
            <article key={s.title} className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <div className="aspect-[4/3] overflow-hidden">
                <Photo name={s.image} alt={s.title} icon={Icon} label={`${s.image}.jpg`} className="h-full w-full transition duration-500 group-hover:scale-105" />
              </div>
              <div className="p-5">
                <h3 className="font-display text-lg font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg2">{s.text}</p>
                <Link to={sitePath(site, 'services')} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline coarse:min-h-11">
                  Learn more <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-10 text-center">
        <Link to={sitePath(site, 'services')} className="btn-outline">
          View All Services
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function GaragePreview() {
  const site = useSite();
  return (
    <section className="bg-surface2/60 py-20 sm:py-24">
      <div className="container-site grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* A mock of the customer dashboard. */}
        <div className="order-2 rounded-3xl border border-line bg-surface p-5 shadow-2xl shadow-ink/10 sm:p-7 lg:order-1">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-semibold text-fg">My Vehicles</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface2 text-fg2">
              <User className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-line bg-surface2 p-3">
            <Photo name="garage-car" alt="Customer's BMW M3" icon={Car} className="h-16 w-24 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">2022 BMW M3 Competition</p>
              <p className="text-xs text-fg3">Next service in 2,400 km</p>
            </div>
            <span className="ml-auto hidden rounded-md bg-ok/15 px-2 py-0.5 text-[11px] font-semibold text-ok sm:inline">Healthy</span>
          </div>
          <div className="mt-4 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold text-fg">Active Repair</p>
              <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">In progress</span>
            </div>
            <p className="mt-1 text-xs text-fg3">Front brake pads and rotors</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2" aria-hidden>
              <div className="h-full w-[65%] rounded-full bg-accent" />
            </div>
            <p className="mt-2 text-right text-[11px] text-fg3">65% complete</p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <SectionHeading
            center={false}
            eyebrow="Customer Garage"
            title="Total Control in Your Customer Garage"
            text="Your vehicles, repairs and invoices in one secure dashboard, on any device."
          />
          <ul className="mt-8 space-y-5">
            {GARAGE_FEATURES.map((f, i) => {
              const Icon = GARAGE_ICONS[i % GARAGE_ICONS.length]!;
              return (
                <li key={f.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold text-fg">{f.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg2">{f.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to={sitePath(site, 'garage')} className="btn-ink mt-8">
            Open My Garage
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Technicians() {
  const site = useSite();
  return (
    <section className="container-site py-20 sm:py-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          center={false}
          eyebrow="Our Team"
          title="Master Certified Technicians"
          text="Factory-trained specialists who work on your make every day."
        />
        <Link to={sitePath(site, 'experts')} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">
          Meet the Experts <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {/* Phones: swipe sideways. Larger screens: grid. */}
      <ul className="no-scrollbar -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {TECHNICIANS.map((t) => (
          <li key={t.name} className="w-[75%] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface shadow-sm sm:w-auto">
            <Photo name={t.image} alt={`${t.name}, ${t.role}`} icon={User} label={`${t.image}.jpg`} className="aspect-square w-full" />
            <div className="p-4">
              <h3 className="font-display font-semibold text-fg">{t.name}</h3>
              <p className="text-sm text-fg2">{t.role}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-fg2">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stars({ className = '' }: { className?: string }) {
  return (
    <span className={`flex gap-0.5 ${className}`} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-4 w-4 fill-warn text-warn" />
      ))}
    </span>
  );
}

function Testimonials() {
  const site = useSite();
  return (
    <section className="bg-sidebar py-20 text-white dark:bg-surface sm:py-24">
      <div className="container-site">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Trusted by Enthusiasts</h2>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/70">
            <Stars />
            <span>4.9 out of 5 from verified customers</span>
          </div>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6">
              <Stars />
              <Quote className="mt-4 h-6 w-6 text-accent" aria-hidden />
              <blockquote className="mt-2 flex-1 text-sm leading-relaxed text-white/80">{t.quote}</blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-white">
                  {t.name[0]}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-white/50">{t.car}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to={sitePath(site, 'reviews')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold transition hover:bg-white/10 coarse:min-h-12"
          >
            Read all reviews <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  const site = useSite();
  return (
    <section className="container-site py-20 sm:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-accent/10 via-surface to-surface px-6 py-14 text-center sm:px-12">
        <ShieldCheck className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Ready for Premium Service?</h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-fg2">
          Book in under two minutes, follow every step of the repair, and pay online when your car is ready.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={sitePath(site, 'book')} className="btn-ink">
            Book an Appointment
          </Link>
          <Link to={sitePath(site, 'garage')} className="btn-outline">
            Create Free Account
          </Link>
        </div>
      </div>
    </section>
  );
}
