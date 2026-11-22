import { Link } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { sitePath, useSite } from '@/site/SiteContext';

/** Placeholder for the sections built in later rounds, so every menu link works. */
export function ComingSoonPage({ title }: { title: string }) {
  const site = useSite();
  return (
    <section className="container-site flex min-h-[60vh] flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Hammer className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="font-display text-3xl font-bold text-fg">{title}</h1>
      <p className="max-w-md text-sm text-fg2">This section is being built. In the meantime, book a visit or call us.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to={sitePath(site, 'book')} className="btn-ink">
          Book Appointment
        </Link>
        <Link to={sitePath(site)} className="btn-outline">
          Back to home
        </Link>
      </div>
    </section>
  );
}
