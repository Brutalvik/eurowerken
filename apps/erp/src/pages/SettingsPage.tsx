import { useSearchParams } from 'react-router-dom';
import { PillTabs } from '@/components/ui/PillTabs';
import { AccessibilityCard } from './settings/AccessibilityCard';
import { BookingCard } from './settings/BookingCard';
import { DataCard } from './settings/data/DataCard';
import { InspectionTemplatesCard } from './settings/InspectionTemplatesCard';
import { PaymentsCard } from './settings/PaymentsCard';
import { TaxesCard } from './settings/TaxesCard';
import { DocumentsCard } from './settings/DocumentsCard';
import { NotificationsCard } from './settings/NotificationsCard';
import { ServicesCard } from './settings/ServicesCard';
import { TeamCard } from './settings/TeamCard';
import { WebsiteTab } from './settings/WebsiteTab';

const TABS = ['Website', 'Services', 'Team', 'Booking', 'Taxes', 'Payments', 'Inspections', 'Notifications', 'Documents', 'Data', 'Accessibility'] as const;
type Tab = (typeof TABS)[number];

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
            <WebsiteTab />
          </div>
        )}
        {tab === 'Services' && <ServicesCard />}
        {tab === 'Team' && <TeamCard />}
        {tab === 'Booking' && <BookingCard />}
        {tab === 'Taxes' && (
          <div className="max-w-3xl">
            <TaxesCard />
          </div>
        )}
        {tab === 'Payments' && (
          <div className="max-w-3xl">
            <PaymentsCard />
          </div>
        )}
        {tab === 'Inspections' && <InspectionTemplatesCard />}
        {tab === 'Data' && <DataCard />}
        {tab === 'Accessibility' && <AccessibilityCard />}
        {tab === 'Notifications' && <NotificationsCard />}
        {tab === 'Documents' && (
          <div className="max-w-3xl">
            <DocumentsCard />
          </div>
        )}
      </div>
    </div>
  );
}
