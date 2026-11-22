import { useLocation } from 'react-router-dom';
import { FlowTabBar } from '@/components/flowbar/FlowTabBar';
import type { FlowTab } from '@/components/flowbar/FlowTabBar';
import { GarageIcon, HomeIcon, PartsIcon, ServicesIcon, TrackIcon } from '@/components/flowbar/icons';
import { sitePath, useSite } from '@/site/SiteContext';

/** Which tab a page belongs to (first path segment after the workshop slug); -1 keeps the bead where it is. */
const SECTION_TAB: Record<string, number> = {
  '': 0,
  services: 1,
  experts: 1,
  book: 1,
  parts: 2,
  cart: 2,
  track: 3,
  garage: 4,
  account: 4,
  login: 4,
  register: 4,
  'reset-password': 4,
};

/** The site's main navigation: the liquid-glass tab bar docked at the bottom. */
export function SiteTabBar() {
  const site = useSite();
  const { pathname } = useLocation();
  const section = pathname.split('/')[2] ?? '';
  const active = SECTION_TAB[section] ?? -1;

  const tabs: FlowTab[] = [
    { label: 'Home', to: sitePath(site), icon: HomeIcon },
    { label: 'Services', to: sitePath(site, 'services'), icon: ServicesIcon },
    { label: 'Parts', to: sitePath(site, 'parts'), icon: PartsIcon },
    { label: 'Track', to: sitePath(site, 'track'), icon: TrackIcon },
    { label: 'Garage', to: sitePath(site, 'garage'), icon: GarageIcon },
  ];

  return <FlowTabBar tabs={tabs} active={active} />;
}
