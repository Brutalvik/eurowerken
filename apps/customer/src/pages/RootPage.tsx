import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Wrench } from 'lucide-react';
import { slugify } from '@eurowerken/shared';

const DEFAULT_SITE = import.meta.env.VITE_DEFAULT_SITE_SLUG as string | undefined;

/**
 * The bare address (no workshop in the path). With VITE_DEFAULT_SITE_SLUG set
 * (a single-workshop deployment) it goes straight to that site; otherwise it
 * asks which workshop. Later: custom domains map straight to a workshop.
 */
export function RootPage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState('');

  if (DEFAULT_SITE) return <Navigate to={`/${DEFAULT_SITE}`} replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const slug = slugify(address.replace(/^.*\//, ''));
    if (slug) navigate(`/${slug}`);
  }

  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-b from-surface2 to-bg px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sidebar">
        <Wrench className="h-5 w-5 text-white" aria-hidden />
      </span>
      <h1 className="mt-5 font-display text-3xl font-bold text-ink">Find your workshop</h1>
      <p className="mt-2 max-w-sm text-sm text-fg2">Enter the web address name your workshop gave you, for example bravo-motors.</p>
      <form onSubmit={onSubmit} className="mt-6 flex w-full max-w-sm gap-2">
        <label htmlFor="site" className="sr-only">
          Workshop web address
        </label>
        <input
          id="site"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="workshop-name"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg outline-none focus:border-accent coarse:min-h-12"
        />
        <button type="submit" className="btn-ink px-4" aria-label="Go">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <div className="mt-12 space-y-1 text-xs text-fg3">
        <p className="flex justify-center gap-4">
          <Link to="/terms" className="hover:text-fg">
            Terms and Conditions
          </Link>
          <Link to="/privacy" className="hover:text-fg">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
