import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PillTabs } from '@/components/ui/PillTabs';
import { BookingCard } from './settings/BookingCard';
import { DocumentsCard } from './settings/DocumentsCard';
import { NotificationsCard } from './settings/NotificationsCard';
import { ServicesCard } from './settings/ServicesCard';
import { TeamCard } from './settings/TeamCard';
import { WebsiteCard } from './settings/WebsiteCard';

const TABS = ['Website', 'Services', 'Team', 'Booking', 'Notifications', 'Documents', 'Workshop'] as const;
type Tab = (typeof TABS)[number];

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}

function Field({ id, label, value, onChange, type = 'text' }: FieldProps): ReactNode {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-xs text-fg outline-none focus:border-accent coarse:min-h-11"
      />
    </div>
  );
}

export function SettingsPage() {
  // The open tab lives in the address (?tab=services), so it survives a reload and can be linked to.
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.toLowerCase() === params.get('tab')) ?? 'Website';
  const setTab = (t: Tab) => setParams(t === 'Website' ? {} : { tab: t.toLowerCase() }, { replace: true });

  return (
    <div className="space-y-4">
      <PillTabs label="Settings sections" options={TABS} value={tab} onChange={setTab} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'Website' && (
          <div className="max-w-3xl">
            <WebsiteCard />
          </div>
        )}
        {tab === 'Services' && <ServicesCard />}
        {tab === 'Team' && <TeamCard />}
        {tab === 'Booking' && <BookingCard />}
        {tab === 'Notifications' && <NotificationsCard />}
        {tab === 'Documents' && (
          <div className="max-w-3xl">
            <DocumentsCard />
          </div>
        )}
        {tab === 'Workshop' && <WorkshopSettings />}
      </div>
    </div>
  );
}

/** Workshop profile and invoicing defaults (not yet saved to the database). */
function WorkshopSettings() {
  const [name, setName] = useState('EuroWerken');
  const [email, setEmail] = useState('service@eurowerken.com');
  const [phone, setPhone] = useState('');
  const [taxLabel, setTaxLabel] = useState('GST');
  const [taxRate, setTaxRate] = useState('5');
  const [terms, setTerms] = useState('15');
  const [saved, setSaved] = useState(false);

  const update = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setSaved(false);
  };

  return (
    <div className="max-w-3xl space-y-4">
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        // TODO: persist through the settings API once the backend exists.
        setSaved(true);
      }}
    >
      <Card className="p-4 sm:p-5">
        <CardHeader title="Workshop profile" subtitle="Shown on invoices and customer emails" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="shop-name" label="Business name" value={name} onChange={update(setName)} />
          <Field id="shop-email" label="Contact email" type="email" value={email} onChange={update(setEmail)} />
          <Field id="shop-phone" label="Phone" type="tel" value={phone} onChange={update(setPhone)} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHeader title="Invoicing" subtitle="Defaults applied to new invoices" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="tax-label" label="Tax label" value={taxLabel} onChange={update(setTaxLabel)} />
          <Field id="tax-rate" label="Tax rate (%)" type="number" value={taxRate} onChange={update(setTaxRate)} />
          <Field id="terms" label="Payment terms (days)" type="number" value={terms} onChange={update(setTerms)} />
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit">Save changes</Button>
        {saved && (
          <span role="status" className="text-xs text-ok">
            Saved locally. Not yet connected to a backend.
          </span>
        )}
      </div>
    </form>
    </div>
  );
}
