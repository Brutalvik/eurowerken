import { NavLink } from 'react-router-dom';
import { sitePath, useSite } from '@/site/SiteContext';

/**
 * "Services | Our experts" switch shown on both pages: a glass segmented control of real links,
 * overlapping the bottom of the page hero.
 */
export function ServicesExpertsSwitch() {
  const site = useSite();
  const items = [
    { path: 'services', label: 'Services' },
    { path: 'experts', label: 'Our experts' },
  ];
  return (
    <nav aria-label="Services and experts" className="container-site relative z-10 -mt-6 flex justify-center">
      <div className="glass-strong inline-flex gap-1 rounded-2xl p-1">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={sitePath(site, item.path)}
            className={({ isActive }) =>
              `flex min-w-[8.5rem] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition coarse:min-h-11 ${
                isActive ? 'bg-ink text-bg shadow-md' : 'text-fg2 hover:bg-surface2 hover:text-fg'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
