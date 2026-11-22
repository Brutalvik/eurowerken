import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  Car,
  ClipboardCheck,
  FileText,
  Gauge,
  Mail,
  MessageSquare,
  Plus,
  ScanLine,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { Photo } from '@/components/Photo';
import { DemoNotice, Pill } from '@/components/ui';
import { GARAGE_HISTORY, GARAGE_VEHICLES, REPAIR_CASES, findRepairCase } from '@/data/catalog';
import { formatMoney } from '@/lib/format';
import { sitePath, useSite } from '@/site/SiteContext';
import { AddVehicleForm } from '@/pages/garage/AddVehicleForm';
import type { NewVehicle } from '@/pages/garage/AddVehicleForm';

interface Vehicle {
  id: string;
  name: string;
  plate: string;
  image: string;
  mileage: string;
  nextService: string;
  health: string;
  activeCase: string | null;
}

type Tone = 'ok' | 'accent' | 'warn' | 'neutral';

function healthTone(health: string): Tone {
  if (health === 'Healthy') return 'ok';
  if (health === 'Repair in progress') return 'accent';
  if (health === 'New') return 'neutral';
  return 'warn';
}

function statusTone(status: string): Tone {
  if (status === 'Paid') return 'ok';
  if (status === 'In progress') return 'accent';
  if (status === 'Unpaid' || status === 'Due') return 'warn';
  return 'neutral';
}

export function GaragePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => GARAGE_VEHICLES.map((v) => ({ ...v })));

  return (
    <div className="container-site space-y-6 py-8 sm:space-y-8 sm:py-12">
      <DemoNotice>Customer accounts are coming soon. This is a preview with sample data.</DemoNotice>
      <Greeting vehicles={vehicles.length} />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 lg:col-span-2">
          <MyVehicles vehicles={vehicles} onAdd={(v) => setVehicles((list) => [...list, v])} />
        </div>
        <div className="min-w-0 space-y-6">
          <ActionNeeded />
          <Reminders vehicles={vehicles} />
        </div>
      </div>

      <ServiceHistory />
    </div>
  );
}

function Greeting({ vehicles }: { vehicles: number }) {
  const site = useSite();
  const active = REPAIR_CASES.filter((c) => c.status !== 'Ready for Pickup').length;
  return (
    <section className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Customer Garage</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm text-fg2">
            {vehicles} vehicle{vehicles === 1 ? '' : 's'} in your garage, {active} active repair{active === 1 ? '' : 's'} at {site.display_name}.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to={sitePath(site, 'book')} className="btn-ink">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Book Appointment
          </Link>
          <Link to={sitePath(site, 'track')} className="btn-outline">
            <ScanLine className="h-4 w-4" aria-hidden />
            Track a repair
          </Link>
        </div>
      </div>
    </section>
  );
}

function MyVehicles({ vehicles, onAdd }: { vehicles: Vehicle[]; onAdd: (v: Vehicle) => void }) {
  const [adding, setAdding] = useState(false);
  const [announce, setAnnounce] = useState('');
  const addRef = useRef<HTMLButtonElement>(null);
  const formId = useId();

  function add(v: NewVehicle) {
    const name = `${v.year} ${v.make} ${v.model}`;
    onAdd({
      id: `v-${Date.now()}`,
      name,
      plate: v.plate,
      image: 'garage-car-new',
      mileage: 'Not recorded yet',
      nextService: 'Set at your first visit',
      health: 'New',
      activeCase: null,
    });
    setAnnounce(`${name} added to your garage.`);
    setAdding(false);
    addRef.current?.focus();
  }

  return (
    <section aria-labelledby="my-vehicles">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-vehicles" className="font-display text-xl font-semibold text-fg">
          My Vehicles
        </h2>
        <button
          ref={addRef}
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          aria-controls={formId}
          className="btn-outline px-4 py-2"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add vehicle
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div id={formId}>
        {adding && (
          <AddVehicleForm
            onAdd={add}
            onCancel={() => {
              setAdding(false);
              addRef.current?.focus();
            }}
          />
        )}
      </div>

      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {vehicles.map((v) => (
          <li key={v.id}>
            <VehicleCard vehicle={v} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function VehicleCard({ vehicle: v }: { vehicle: Vehicle }) {
  const site = useSite();
  const repair = v.activeCase ? findRepairCase(v.activeCase) : undefined;
  return (
    <article className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      <Photo name={v.image} alt={v.name} icon={Car} label={v.name} className="aspect-[16/9] w-full" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-fg">{v.name}</h3>
            <p className="mt-0.5 font-mono text-xs tracking-wider text-fg3">{v.plate}</p>
          </div>
          <Pill tone={healthTone(v.health)} className="shrink-0">
            {v.health}
          </Pill>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-surface2/70 p-3">
            <dt className="flex items-center gap-1 text-fg3">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              Mileage
            </dt>
            <dd className="mt-1 font-semibold text-fg">{v.mileage}</dd>
          </div>
          <div className="rounded-xl bg-surface2/70 p-3">
            <dt className="flex items-center gap-1 text-fg3">
              <Wrench className="h-3.5 w-3.5" aria-hidden />
              Next service
            </dt>
            <dd className="mt-1 font-semibold text-fg">{v.nextService}</dd>
          </div>
        </dl>

        {repair && (
          <div className="mt-4 rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <p className="font-semibold text-fg">Active repair</p>
              <span className="text-xs font-semibold text-accent">{repair.progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={`Repair progress for ${v.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={repair.progress}
              className="mt-2 h-2 overflow-hidden rounded-full bg-surface2"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${repair.progress}%` }} />
            </div>
            <Link
              to={sitePath(site, `track/${repair.trackingId}`)}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline coarse:min-h-11"
            >
              View live status
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function ActionNeeded() {
  const site = useSite();
  const found = REPAIR_CASES.flatMap((c) => c.lineItems.filter((li) => li.state === 'needs-approval').map((item) => ({ c, item })))[0];

  return (
    <section aria-labelledby="action-needed" className="glass rounded-2xl border-l-4 border-l-warn p-5">
      <h2 id="action-needed" className="flex items-center gap-2 font-semibold text-fg">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warn/12 text-warn">
          <TriangleAlert className="h-4 w-4" aria-hidden />
        </span>
        Action needed
      </h2>
      {found ? (
        <>
          <p className="mt-4 text-xs text-fg3">
            {found.c.vehicle} &middot; Work order #{found.c.workOrder}
          </p>
          <p className="mt-1 font-semibold text-fg">{found.item.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-fg2">{found.item.text}</p>
          <p className="mt-3 text-sm text-fg2">
            Estimate <span className="font-display text-lg font-bold text-fg">{formatMoney(found.item.price)}</span>
          </p>
          <Link to={sitePath(site, `track/${found.c.trackingId}`)} className="btn-ink mt-4 w-full">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            Review estimate
          </Link>
        </>
      ) : (
        <p className="mt-3 text-sm text-fg2">Nothing waiting on you right now.</p>
      )}
    </section>
  );
}

function Switch({ label, icon: Icon, checked, onChange }: { label: string; icon: typeof Mail; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-1 coarse:min-h-11">
      <span id={id} className="flex items-center gap-2 text-sm text-fg2">
        <Icon className="h-4 w-4 text-fg3" aria-hidden />
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className="flex h-11 shrink-0 items-center px-0.5"
      >
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-accent' : 'bg-fg3/40'}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
          />
        </span>
      </button>
    </div>
  );
}

function Reminders({ vehicles }: { vehicles: Vehicle[] }) {
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  return (
    <section aria-labelledby="reminders" className="glass rounded-2xl p-5">
      <h2 id="reminders" className="flex items-center gap-2 font-semibold text-fg">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Bell className="h-4 w-4" aria-hidden />
        </span>
        Reminders
      </h2>
      <ul className="mt-4 space-y-3">
        {vehicles.map((v) => (
          <li key={v.id} className="flex items-start gap-3 rounded-xl bg-surface2/70 p-3">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{v.name}</p>
              <p className="text-xs text-fg2">{v.nextService}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs font-medium text-fg3">Remind me by</p>
        <Switch label="Email" icon={Mail} checked={email} onChange={setEmail} />
        <Switch label="Text message (SMS)" icon={MessageSquare} checked={sms} onChange={setSms} />
      </div>
    </section>
  );
}

function ServiceHistory() {
  const [note, setNote] = useState('');
  const invoiceBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface2 coarse:min-h-11';

  function showNote(invoice: string) {
    setNote(`${invoice}: invoices will be downloadable once customer accounts are live.`);
  }

  return (
    <section aria-labelledby="service-history">
      <h2 id="service-history" className="font-display text-xl font-semibold text-fg">
        Service history
      </h2>
      <div aria-live="polite">
        {note && (
          <p role="note" className="mt-3 rounded-xl border border-line bg-surface2/70 px-4 py-3 text-xs text-fg2">
            {note}
          </p>
        )}
      </div>

      {/* Desktop and tablet: table. */}
      <div className="glass mt-4 hidden overflow-hidden rounded-2xl md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-fg3">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Date</th>
              <th scope="col" className="px-5 py-3 font-semibold">Vehicle</th>
              <th scope="col" className="px-5 py-3 font-semibold">Service</th>
              <th scope="col" className="px-5 py-3 font-semibold">Status</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                <span className="sr-only">Invoice</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {GARAGE_HISTORY.map((h) => (
              <tr key={h.invoice}>
                <td className="whitespace-nowrap px-5 py-4 text-fg2">{h.date}</td>
                <td className="px-5 py-4 text-fg">{h.vehicle}</td>
                <td className="px-5 py-4 text-fg2">{h.service}</td>
                <td className="px-5 py-4">
                  <Pill tone={statusTone(h.status)}>{h.status}</Pill>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-fg">{formatMoney(h.total)}</td>
                <td className="px-5 py-4 text-right">
                  <button type="button" onClick={() => showNote(h.invoice)} className={invoiceBtn} aria-label={`Invoice ${h.invoice}`}>
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    Invoice
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked cards. */}
      <ul className="mt-4 space-y-3 md:hidden">
        {GARAGE_HISTORY.map((h) => (
          <li key={h.invoice} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-fg">{h.service}</p>
                <p className="mt-0.5 text-xs text-fg3">
                  {h.date} &middot; {h.vehicle}
                </p>
              </div>
              <Pill tone={statusTone(h.status)} className="shrink-0">
                {h.status}
              </Pill>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="font-display text-base font-bold tabular-nums text-fg">{formatMoney(h.total)}</p>
              <button type="button" onClick={() => showNote(h.invoice)} className={invoiceBtn} aria-label={`Invoice ${h.invoice}`}>
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Invoice
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
