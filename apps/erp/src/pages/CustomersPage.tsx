import { useCallback, useEffect, useMemo, useState } from 'react';
import { Car, ExternalLink, Mail, Phone } from 'lucide-react';
import { customerName, getCustomer, getCustomerSiteUrl, listCustomers } from '@/api/customers';
import type { Customer, CustomerVehicle } from '@/api/customers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { Dialog, ErrorNote } from './inventory/PartForm';
import { useMessageMutes } from '@/api/messageMutes';
import { MuteCustomerButton } from '@/components/MuteCustomerButton';

const dateFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFormat.format(d);
}

function vehicleLabel(v: CustomerVehicle): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

function uniqueMakes(c: Customer): string {
  return Array.from(new Set(c.vehicles.map((v) => v.make))).join(', ');
}

/** tel: wants the digits and a leading plus only. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function matches(c: Customer, q: string): boolean {
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && c.phone && c.phone.replace(/\D/g, '').includes(digits)) return true;
  const fields = [c.full_name, c.email, c.phone, ...c.vehicles.flatMap((v) => [v.plate, v.vin, v.make, v.model, v.nickname])];
  return fields.some((v) => v?.toLowerCase().includes(q));
}

const linkClass =
  'inline-flex min-w-0 items-center gap-2 break-all rounded text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11';

/**
 * Customers who signed in on the workshop's website. Read-only: customers own
 * their accounts and edit them on the customer site.
 */
export function CustomersPage() {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setCustomers(await listCustomers(workshopId));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Customers could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workshopId) return;
    let live = true;
    void getCustomerSiteUrl(workshopId).then((url) => {
      if (live) setSiteUrl(url);
    });
    return () => {
      live = false;
    };
  }, [workshopId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q === '' ? customers : customers.filter((c) => matches(c, q));
  }, [customers, search]);

  const open = useCallback(
    (c: Customer) => {
      setSelected(c);
      if (!workshopId) return;
      // Refresh in the background so the panel shows the latest details and vehicles.
      void getCustomer(workshopId, c.id)
        .then((fresh) => {
          if (!fresh) return;
          setSelected((cur) => (cur?.id === fresh.id ? fresh : cur));
          setCustomers((list) => list.map((x) => (x.id === fresh.id ? fresh : x)));
        })
        .catch(() => undefined);
    },
    [workshopId],
  );

  const columns: Column<Customer>[] = [
    {
      header: 'Customer',
      mobile: 'title',
      cell: (c) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open(c);
          }}
          className="block min-w-0 max-w-full rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11"
        >
          <span className="block break-words font-medium text-fg hover:underline">{customerName(c)}</span>
          <span className="mt-0.5 block break-all text-[10px] font-normal text-fg3">{c.email}</span>
        </button>
      ),
    },
    {
      header: 'Phone',
      cell: (c) => (c.phone ? <span className="whitespace-nowrap">{c.phone}</span> : <span className="text-fg3">Not given</span>),
    },
    {
      header: 'Vehicles',
      cell: (c) =>
        c.vehicles.length === 0 ? (
          <span className="text-fg3">None</span>
        ) : (
          <span title={c.vehicles.map(vehicleLabel).join('\n')}>
            <span className="font-medium text-fg">{c.vehicles.length}</span>
            <span className="ml-1.5 break-words text-[10px] text-fg3">{uniqueMakes(c)}</span>
          </span>
        ),
    },
    {
      header: 'Customer since',
      mobile: 'corner',
      cell: (c) => <span className="whitespace-nowrap text-fg2">{formatDate(c.linked_at)}</span>,
    },
  ];

  let body;
  if (loading) {
    body = (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading customers...
      </p>
    );
  } else if (loadError) {
    body = (
      <div className="space-y-3 p-4">
        <ErrorNote errors={`Customers could not be loaded. ${loadError}`} />
        <Button variant="ghost" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  } else if (customers.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="max-w-md text-xs text-fg2">
          No customers yet. Customers appear here after they sign in on your website.
        </p>
        {siteUrl && (
          <a href={siteUrl} target="_blank" rel="noreferrer" className={`${linkClass} text-xs font-semibold`}>
            Open your customer website
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        )}
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(c) => c.id}
        onRowClick={open}
        emptyMessage="No customers match your search."
      />
    );
  }

  const count =
    search.trim() === ''
      ? `${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}`
      : `${filtered.length} of ${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, email, phone, plate or VIN"
          className="w-full sm:w-72"
        />
        {!loading && !loadError && (
          <p className="text-xs text-fg2" aria-live="polite">
            {count}
          </p>
        )}
      </div>

      <Card className="overflow-hidden">{body}</Card>

      <CustomerDialog customer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const mutes = useMessageMutes();
  return (
    <Dialog
      open={customer !== null}
      title={customer ? customerName(customer) : 'Customer'}
      onClose={onClose}
      closeOnBackdrop
      footer={
        <Button variant="ghost" onClick={onClose} data-autofocus>
          Close
        </Button>
      }
    >
      {customer && (
        <div className="space-y-5 text-xs">
          <section aria-labelledby="customer-contact" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="customer-contact" className="text-[10px] font-medium uppercase tracking-wider text-fg3">
                Contact
              </h3>
              <MuteCustomerButton email={customer.email} name={customerName(customer)} mutes={mutes} />
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-fg3">Email</dt>
                <dd className="mt-0.5">
                  <a href={`mailto:${customer.email}`} className={linkClass}>
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {customer.email}
                  </a>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-fg3">Phone</dt>
                <dd className="mt-0.5">
                  {customer.phone ? (
                    <a href={telHref(customer.phone)} className={linkClass}>
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {customer.phone}
                    </a>
                  ) : (
                    <span className="text-fg3">Not given</span>
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-fg3">Customer since</dt>
                <dd className="mt-0.5 text-fg">{formatDate(customer.linked_at)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-fg3">Account created</dt>
                <dd className="mt-0.5 text-fg">{formatDate(customer.created_at)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="customer-vehicles" className="space-y-2">
            <h3 id="customer-vehicles" className="text-[10px] font-medium uppercase tracking-wider text-fg3">
              Vehicles ({customer.vehicles.length})
            </h3>
            {customer.vehicles.length === 0 ? (
              <p className="text-fg2">No vehicles added yet.</p>
            ) : (
              <ul className="space-y-2">
                {customer.vehicles.map((v) => (
                  <li key={v.id} className="flex gap-3 rounded-lg border border-line/70 bg-surface2/50 p-3">
                    <Car className="mt-0.5 h-4 w-4 shrink-0 text-fg3" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-semibold text-fg">
                        {vehicleLabel(v)}
                        {v.nickname && <span className="ml-1.5 font-normal text-fg3">({v.nickname})</span>}
                      </div>
                      <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="inline text-fg3">Plate: </dt>
                          <dd className="inline text-fg2">{v.plate || 'Not given'}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="inline text-fg3">VIN: </dt>
                          <dd className="inline break-all font-mono text-fg2">{v.vin || 'Not given'}</dd>
                        </div>
                      </dl>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="rounded-lg border border-dashed border-line px-3 py-2 text-fg2">
            Bookings, repairs and invoices will appear here.
          </p>
          <p className="text-[11px] text-fg3">
            Customers manage their own name, phone and vehicles on your website, so these details are read-only here.
          </p>
        </div>
      )}
    </Dialog>
  );
}
