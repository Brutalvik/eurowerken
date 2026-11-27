import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, ExternalLink, Mail, Phone } from 'lucide-react';
import { customerName, getCustomer, getCustomerSiteUrl, listCustomers } from '@/api/customers';
import type { Customer, CustomerVehicle } from '@/api/customers';
import { contactName, contactSourceLabel, listContacts, updateContact } from '@/api/contacts';
import type { Contact, ContactPatch, ContactVehicle } from '@/api/contacts';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/SearchInput';
import { Dialog, ErrorNote, Labeled, inputClass } from './inventory/PartForm';
import { useMessageMutes } from '@/api/messageMutes';
import { MuteCustomerButton } from '@/components/MuteCustomerButton';

const dateFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFormat.format(d);
}

function vehicleLabel(v: Pick<CustomerVehicle, 'year' | 'make' | 'model'> | ContactVehicle): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
}

/**
 * One line of the list: an online account (with any imported records of the same person), or a contact of the
 * shop that has no online account (imported from another system, or added by staff).
 */
type Entry =
  | { kind: 'account'; id: string; customer: Customer; contacts: Contact[] }
  | { kind: 'contact'; id: string; contact: Contact };

function entryName(e: Entry): string {
  return e.kind === 'account' ? customerName(e.customer) : contactName(e.contact);
}

function entryEmail(e: Entry): string | null {
  return e.kind === 'account' ? e.customer.email : e.contact.email;
}

function entryPhone(e: Entry): string | null {
  if (e.kind === 'contact') return e.contact.phone;
  return e.customer.phone || e.contacts.find((c) => c.phone)?.phone || null;
}

function entryVehicles(e: Entry): (CustomerVehicle | ContactVehicle)[] {
  return e.kind === 'account' ? [...e.customer.vehicles, ...e.contacts.flatMap((c) => c.vehicles)] : e.contact.vehicles;
}

function entrySince(e: Entry): string {
  return e.kind === 'account' ? e.customer.linked_at : e.contact.created_at;
}

function uniqueMakes(e: Entry): string {
  return Array.from(new Set(entryVehicles(e).map((v) => v.make).filter(Boolean))).join(', ');
}

/** Accounts first by when they joined, newest first, with their linked contacts; then contacts without an account. */
function buildEntries(customers: Customer[], contacts: Contact[]): Entry[] {
  const accounts = new Map(customers.map((c) => [c.id, [] as Contact[]]));
  const standalone: Contact[] = [];
  for (const c of contacts) {
    const list = c.linked_account_id ? accounts.get(c.linked_account_id) : undefined;
    if (list) list.push(c);
    else standalone.push(c);
  }
  const all: Entry[] = [
    ...customers.map((c): Entry => ({ kind: 'account', id: `a:${c.id}`, customer: c, contacts: accounts.get(c.id) ?? [] })),
    ...standalone.map((c): Entry => ({ kind: 'contact', id: `c:${c.id}`, contact: c })),
  ];
  return all.sort((a, b) => entrySince(b).localeCompare(entrySince(a)));
}

/** tel: wants the digits and a leading plus only. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function matches(e: Entry, q: string): boolean {
  const digits = q.replace(/\D/g, '');
  const phones = e.kind === 'account' ? [e.customer.phone, ...e.contacts.map((c) => c.phone)] : [e.contact.phone];
  if (digits.length >= 3 && phones.some((p) => p && p.replace(/\D/g, '').includes(digits))) return true;
  const people =
    e.kind === 'account'
      ? [e.customer.full_name, e.customer.email, ...e.contacts.flatMap((c) => [c.name, c.email, c.address])]
      : [e.contact.name, e.contact.email, e.contact.address, e.contact.source_system];
  const cars = entryVehicles(e).flatMap((v) => [v.plate, v.vin, v.make, v.model, 'nickname' in v ? v.nickname : null]);
  return [...people, ...phones, ...cars].some((v) => v?.toLowerCase().includes(q));
}

const linkClass =
  'inline-flex min-w-0 items-center gap-2 break-all rounded text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11';

/**
 * Every customer of the workshop: those who signed in on the website (online accounts, read-only here because
 * customers own them) and the shop's own contacts without an online account (imported from another shop system,
 * or added by staff). Contact details of those are editable with Customers (full) or Settings (full). An imported
 * record of someone who also has an online account is shown with that account, not twice.
 */
export function CustomersPage() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEditContacts = can('customers', 'full') || can('settings', 'full');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [cs, ct] = await Promise.all([listCustomers(workshopId), listContacts(workshopId)]);
      setCustomers(cs);
      setContacts(ct);
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

  const entries = useMemo(() => buildEntries(customers, contacts), [customers, contacts]);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q === '' ? entries : entries.filter((e) => matches(e, q));
  }, [entries, search]);

  const open = useCallback(
    (e: Entry) => {
      setSelectedId(e.id);
      if (!workshopId || e.kind !== 'account') return;
      // Refresh in the background so the panel shows the latest details and vehicles.
      void getCustomer(workshopId, e.customer.id)
        .then((fresh) => {
          if (!fresh) return;
          setCustomers((list) => list.map((x) => (x.id === fresh.id ? fresh : x)));
        })
        .catch(() => undefined);
    },
    [workshopId],
  );

  const onContactSaved = useCallback((c: Contact) => {
    setContacts((list) => list.map((x) => (x.id === c.id ? c : x)));
  }, []);

  const columns: Column<Entry>[] = [
    {
      header: 'Customer',
      mobile: 'title',
      cell: (e) => (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            open(e);
          }}
          className="block min-w-0 max-w-full rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11"
        >
          <span className="block break-words font-medium text-fg hover:underline">{entryName(e)}</span>
          {entryEmail(e) && <span className="mt-0.5 block break-all text-[10px] font-normal text-fg3">{entryEmail(e)}</span>}
          {e.kind === 'contact' && (
            <span className="mt-1 flex flex-wrap gap-1">
              <Badge tone="neutral">No online account</Badge>
              <Badge tone="info">{contactSourceLabel(e.contact)}</Badge>
            </span>
          )}
          {e.kind === 'account' && e.contacts.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              <Badge tone="info">Also {contactSourceLabel(e.contacts[0]).toLowerCase()}</Badge>
            </span>
          )}
        </button>
      ),
    },
    {
      header: 'Phone',
      cell: (e) => {
        const phone = entryPhone(e);
        return phone ? <span className="whitespace-nowrap">{phone}</span> : <span className="text-fg3">Not given</span>;
      },
    },
    {
      header: 'Vehicles',
      cell: (e) => {
        const cars = entryVehicles(e);
        return cars.length === 0 ? (
          <span className="text-fg3">None</span>
        ) : (
          <span title={cars.map(vehicleLabel).join('\n')}>
            <span className="font-medium text-fg">{cars.length}</span>
            <span className="ml-1.5 break-words text-[10px] text-fg3">{uniqueMakes(e)}</span>
          </span>
        );
      },
    },
    {
      header: 'Customer since',
      mobile: 'corner',
      cell: (e) => <span className="whitespace-nowrap text-fg2">{formatDate(entrySince(e))}</span>,
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
  } else if (entries.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="max-w-md text-xs text-fg2">
          No customers yet. Customers appear here after they sign in on your website, or when you import them from your
          previous shop system.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {siteUrl && (
            <a href={siteUrl} target="_blank" rel="noreferrer" className={`${linkClass} text-xs font-semibold`}>
              Open your customer website
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </a>
          )}
          {canEditContacts && (
            <Link to="/settings?tab=data" className={`${linkClass} text-xs font-semibold`}>
              Import customers
            </Link>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(e) => e.id}
        onRowClick={open}
        emptyMessage="No customers match your search."
      />
    );
  }

  const total = entries.length;
  const noun = total === 1 ? 'customer' : 'customers';
  const count = search.trim() === '' ? `${total} ${noun}` : `${filtered.length} of ${total} ${noun}`;

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

      <CustomerDialog entry={selected} canEdit={canEditContacts} onSaved={onContactSaved} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function VehicleList({ vehicles, imported }: { vehicles: (CustomerVehicle | ContactVehicle)[]; imported?: boolean }) {
  return (
    <ul className="space-y-2">
      {vehicles.map((v) => (
        <li key={v.id} className="flex gap-3 rounded-lg border border-line/70 bg-surface2/50 p-3">
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-fg3" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="break-words font-semibold text-fg">
              {vehicleLabel(v)}
              {'nickname' in v && v.nickname && <span className="ml-1.5 font-normal text-fg3">({v.nickname})</span>}
              {imported && <span className="ml-1.5 text-[10px] font-normal text-fg3">Imported</span>}
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
              {'odometer_km' in v && v.odometer_km !== null && (
                <div className="min-w-0">
                  <dt className="inline text-fg3">Odometer: </dt>
                  <dd className="inline text-fg2">{v.odometer_km.toLocaleString('en-CA')} km</dd>
                </div>
              )}
              {'notes' in v && v.notes && (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="inline text-fg3">Notes: </dt>
                  <dd className="inline whitespace-pre-line break-words text-fg2">{v.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ContactLine({ label, value, href, icon }: { label: string; value: string | null; href?: string; icon?: 'mail' | 'phone' }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg3">{label}</dt>
      <dd className="mt-0.5">
        {value && href ? (
          <a href={href} className={linkClass}>
            {icon === 'mail' && <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {icon === 'phone' && <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {value}
          </a>
        ) : value ? (
          <span className="whitespace-pre-line break-words text-fg">{value}</span>
        ) : (
          <span className="text-fg3">Not given</span>
        )}
      </dd>
    </div>
  );
}

function CustomerDialog({
  entry,
  canEdit,
  onSaved,
  onClose,
}: {
  entry: Entry | null;
  canEdit: boolean;
  onSaved: (c: Contact) => void;
  onClose: () => void;
}) {
  const mutes = useMessageMutes();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactPatch>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryId = entry?.id ?? null;
  useEffect(() => {
    setEditing(false);
    setError(null);
  }, [entryId]);

  const contact = entry?.kind === 'contact' ? entry.contact : null;

  const startEdit = () => {
    if (!contact) return;
    setDraft({ name: contact.name ?? '', email: contact.email ?? '', phone: contact.phone ?? '', address: contact.address ?? '', notes: contact.notes ?? '' });
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!contact) return;
    const email = (draft.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('That email address does not look right.');
      return;
    }
    if (!(draft.name ?? '').trim() && !email && !(draft.phone ?? '').trim()) {
      setError('Keep at least a name, email or phone.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateContact(contact.id, draft));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The customer could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const footer = editing ? (
    <>
      <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
        Cancel
      </Button>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </>
  ) : (
    <>
      {contact && canEdit && (
        <Button variant="ghost" onClick={startEdit}>
          Edit details
        </Button>
      )}
      <Button variant="ghost" onClick={onClose} data-autofocus>
        Close
      </Button>
    </>
  );

  const field = (key: keyof ContactPatch, label: string, type = 'text') => (
    <Labeled id={`contact-${key}`} label={label}>
      {key === 'notes' || key === 'address' ? (
        <textarea
          id={`contact-${key}`}
          rows={key === 'notes' ? 4 : 2}
          className={inputClass}
          value={draft[key] ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
      ) : (
        <input
          id={`contact-${key}`}
          type={type}
          className={inputClass}
          value={draft[key] ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
      )}
    </Labeled>
  );

  return (
    <Dialog open={entry !== null} title={entry ? entryName(entry) : 'Customer'} onClose={onClose} closeOnBackdrop={!editing} footer={footer}>
      {entry?.kind === 'account' && (
        <div className="space-y-5 text-xs">
          <section aria-labelledby="customer-contact" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="customer-contact" className="text-[10px] font-medium uppercase tracking-wider text-fg3">
                Contact
              </h3>
              <MuteCustomerButton email={entry.customer.email} name={customerName(entry.customer)} mutes={mutes} />
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <ContactLine label="Email" value={entry.customer.email} href={`mailto:${entry.customer.email}`} icon="mail" />
              <ContactLine label="Phone" value={entry.customer.phone} href={entry.customer.phone ? telHref(entry.customer.phone) : undefined} icon="phone" />
              <ContactLine label="Customer since" value={formatDate(entry.customer.linked_at)} />
              <ContactLine label="Account created" value={formatDate(entry.customer.created_at)} />
            </dl>
          </section>

          <section aria-labelledby="customer-vehicles" className="space-y-2">
            <h3 id="customer-vehicles" className="text-[10px] font-medium uppercase tracking-wider text-fg3">
              Vehicles ({entry.customer.vehicles.length})
            </h3>
            {entry.customer.vehicles.length === 0 ? <p className="text-fg2">No vehicles added yet.</p> : <VehicleList vehicles={entry.customer.vehicles} />}
          </section>

          {entry.contacts.map((c) => (
            <section key={c.id} aria-label={contactSourceLabel(c)} className="space-y-2 rounded-lg border border-dashed border-line p-3">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-fg3">{contactSourceLabel(c)}</h3>
              <p className="text-fg2">
                The import matched this person to their online account by email or phone, so the records were linked
                rather than copied.
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <ContactLine label="Name" value={c.name} />
                <ContactLine label="Phone" value={c.phone} />
                <ContactLine label="Address" value={c.address} />
                <ContactLine label="Past visits imported" value={String(c.imported_visits)} />
                {c.notes && <ContactLine label="Notes" value={c.notes} />}
              </dl>
              {c.vehicles.length > 0 && <VehicleList vehicles={c.vehicles} imported />}
            </section>
          ))}

          <p className="text-[11px] text-fg3">
            Customers manage their own name, phone and vehicles on your website, so these details are read-only here.
          </p>
        </div>
      )}

      {contact && !editing && (
        <div className="space-y-5 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">No online account</Badge>
            <Badge tone="info">{contactSourceLabel(contact)}</Badge>
          </div>
          <section aria-labelledby="contact-details" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="contact-details" className="text-[10px] font-medium uppercase tracking-wider text-fg3">
                Contact
              </h3>
              {contact.email && <MuteCustomerButton email={contact.email} name={contactName(contact)} mutes={mutes} />}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <ContactLine label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} icon="mail" />
              <ContactLine label="Phone" value={contact.phone} href={contact.phone ? telHref(contact.phone) : undefined} icon="phone" />
              <ContactLine label="Address" value={contact.address} />
              <ContactLine label="Added" value={formatDate(contact.created_at)} />
              {contact.external_id && <ContactLine label="Id in the old system" value={contact.external_id} />}
              <ContactLine label="Past visits imported" value={String(contact.imported_visits)} />
            </dl>
            {contact.notes && (
              <div>
                <p className="text-fg3">Notes</p>
                <p className="mt-0.5 whitespace-pre-line break-words text-fg">{contact.notes}</p>
              </div>
            )}
          </section>
          <section aria-labelledby="contact-vehicles" className="space-y-2">
            <h3 id="contact-vehicles" className="text-[10px] font-medium uppercase tracking-wider text-fg3">
              Vehicles ({contact.vehicles.length})
            </h3>
            {contact.vehicles.length === 0 ? <p className="text-fg2">No vehicles on file.</p> : <VehicleList vehicles={contact.vehicles} />}
          </section>
          <p className="text-[11px] text-fg3">
            Their past visits are in Service history. When they sign in on your website with the same email, a booking
            finds these details and cars.
          </p>
        </div>
      )}

      {contact && editing && (
        <div className="space-y-3 text-xs">
          <ErrorNote errors={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', 'Name')}
            {field('email', 'Email', 'email')}
            {field('phone', 'Phone', 'tel')}
          </div>
          {field('address', 'Address')}
          {field('notes', 'Notes')}
          <p className="text-[11px] text-fg3">Another customer cannot have the same email or phone.</p>
        </div>
      )}
    </Dialog>
  );
}
