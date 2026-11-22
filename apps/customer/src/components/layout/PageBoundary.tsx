import { Component, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';

/**
 * Wraps each page: a spinner while the page's code loads, and a friendly message if the page fails,
 * so one broken page never blanks the whole site (header, footer and navigation keep working).
 */
export function PageBoundary({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  return (
    <ErrorBoundary key={resetKey}>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
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
      <div className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center" role="alert">
        <TriangleAlert className="h-8 w-8 text-warn" aria-hidden />
        <h1 className="font-display text-xl font-semibold text-fg">This page could not be shown</h1>
        <p className="max-w-sm text-sm text-fg2">Something went wrong loading it. Try again, or use the menu to go elsewhere.</p>
        <button type="button" onClick={() => window.location.reload()} className="btn-outline mt-2">
          Try again
        </button>
      </div>
    );
  }
}
