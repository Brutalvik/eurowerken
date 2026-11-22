import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { MADE_BY_NOTICE } from '@eurowerken/shared';

/** No published workshop site at this address (or it is not published yet). */
export function SiteNotFound({ message }: { message?: string }) {
  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <SearchX className="h-10 w-10 text-fg3" aria-hidden />
      <h1 className="font-display text-2xl font-bold text-fg">Workshop not found</h1>
      <p className="max-w-md text-sm text-fg2">
        {message ?? 'There is no published workshop website at this address. Check the link, or ask the workshop for it.'}
      </p>
      <Link to="/" className="text-sm font-semibold text-accent hover:underline">
        Find a workshop
      </Link>
      <p className="mt-8 text-xs text-fg3">{MADE_BY_NOTICE}</p>
    </div>
  );
}
