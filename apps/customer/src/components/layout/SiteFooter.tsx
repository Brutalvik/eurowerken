import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ExternalLink, Facebook, Globe, Instagram, Mail, MapPin, Phone, Youtube } from 'lucide-react';
import { useBookingSettings, weeklyHoursLines } from '@/api/booking';
import { sitePath, useSite } from '@/site/SiteContext';
import { Wordmark } from '../Wordmark';

const PLATFORM = [
  { path: 'garage', label: 'Customer Garage' },
  { path: 'book', label: 'Book Appointment' },
  { path: 'track', label: 'Track Repair' },
  { path: 'parts', label: 'Parts Shop' },
  { path: 'reviews', label: 'Reviews' },
];

const SERVICES = [
  'Computer Diagnostics',
  'Scheduled Maintenance',
  'Performance Tuning',
  'Engine & Transmission',
  'Electrical Systems',
];

export function SiteFooter() {
  const site = useSite();
  // Opening hours come from the business hours (ERP: Settings, Booking), the same ones booking uses.
  const { data: booking } = useBookingSettings();
  const hoursLines = booking ? weeklyHoursLines(booking.hours) : [];
  const socials = [
    { url: site.instagram_url, label: 'Instagram', Icon: Instagram },
    { url: site.facebook_url, label: 'Facebook', Icon: Facebook },
    { url: site.youtube_url, label: 'YouTube', Icon: Youtube },
  ].filter((s) => s.url);

  return (
    <footer className="pb-safe bg-sidebar text-white">
      <div className="container-site grid grid-cols-2 gap-x-6 gap-y-10 py-14 lg:grid-cols-4 lg:py-16">
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <Wordmark site={site} inverted />
          <p className="max-w-xs text-sm leading-relaxed text-white/60">
            {site.tagline ?? 'Repair, maintenance and performance work for European vehicles, with transparent tracking from booking to pickup.'}
          </p>
          {socials.length > 0 && (
            <div className="flex gap-2">
              {socials.map(({ url, label, Icon }) => (
                <a
                  key={label}
                  href={url!}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        <FooterColumn title="Platform">
          {PLATFORM.map((l) => (
            <li key={l.path}>
              <Link to={sitePath(site, l.path)} className="hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title="Services">
          {SERVICES.map((s) => (
            <li key={s}>
              <Link to={sitePath(site, 'services')} className="hover:text-white">
                {s}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title="Contact & Hours" className="col-span-2 lg:col-span-1">
          {site.address && (
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>{site.address}</span>
            </li>
          )}
          {site.phone && (
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">
                {site.phone}
              </a>
            </li>
          )}
          {site.email && (
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <a href={`mailto:${site.email}`} className="break-all hover:text-white">
                {site.email}
              </a>
            </li>
          )}
          {hoursLines.length > 0 && (
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>
                {hoursLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </li>
          )}
          {site.own_website_url && (
            <li className="flex gap-2.5">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <a
                href={site.own_website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-white/80 hover:text-white"
              >
                Visit our website
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          )}
          {!site.address && !site.phone && !site.email && hoursLines.length === 0 && !site.own_website_url && (
            <li className="text-white/40">Contact details coming soon.</li>
          )}
        </FooterColumn>
      </div>

      <div className="border-t border-white/10">
        <div className="container-site flex flex-col gap-3 py-6 text-xs text-white/45 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {site.display_name}. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to={sitePath(site, 'privacy')} className="hover:text-white">
              Privacy Policy
            </Link>
            <Link to={sitePath(site, 'terms')} className="hover:text-white">
              Terms and Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</h2>
      <ul className="mt-5 space-y-3 text-sm text-white/60">{children}</ul>
    </div>
  );
}
