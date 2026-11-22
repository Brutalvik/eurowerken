import { Component, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Wraps the routed page: a spinner while the page's code loads, and a
 * friendly message if the page fails, so one broken page never blanks the
 * whole ERP (sidebar and header keep working). Same as the customer site's.
 */
export function PageBoundary({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  return (
    <ErrorBoundary key={resetKey}>
      <Suspense
        fallback={
          <div className="flex h-72 items-center justify-center" role="status" aria-label="Loading page">
            <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 text-center" role="alert">
        <TriangleAlert className="h-8 w-8 text-warn" aria-hidden />
        <h2 className="font-display text-base font-semibold text-fg">This page could not be shown</h2>
        <p className="max-w-sm text-sm text-fg2">Something went wrong loading it. Try again, or use the menu to go elsewhere.</p>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }
}
