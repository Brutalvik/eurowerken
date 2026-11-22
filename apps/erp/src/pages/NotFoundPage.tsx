import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
      <h2 className="font-display text-base font-semibold">Page not found</h2>
      <p className="text-sm text-fg2">The page you are looking for does not exist.</p>
      <Link to="/dashboard" className="text-sm font-medium text-accent hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
