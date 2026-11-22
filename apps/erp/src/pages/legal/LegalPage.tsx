import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LEGAL_DRAFT, LEGAL_EFFECTIVE_DATE, MADE_BY_NOTICE } from '@eurowerken/shared';
import type { LegalDocument } from '@eurowerken/shared';
import { BRAND } from '@/config/brand';

/** Public page for the shared Terms and Privacy texts (packages/shared/src/legal.ts). */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <div className="pt-safe pb-safe min-h-[100dvh] bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {BRAND.prefix}
          {BRAND.suffix}
        </Link>
        <article className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-8">
          <h1 className="font-display text-xl font-semibold text-fg sm:text-2xl">{doc.title}</h1>
          <p className="mt-1 text-xs text-fg3">Effective {LEGAL_EFFECTIVE_DATE}</p>
          {LEGAL_DRAFT && (
            <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              Draft under review. This text may change before it takes effect.
            </p>
          )}
          <p className="mt-5 text-sm leading-relaxed text-fg2">{doc.intro}</p>
          {doc.sections.map((s) => (
            <section key={s.heading} className="mt-6">
              <h2 className="font-display text-sm font-semibold text-fg">{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="mt-2 text-sm leading-relaxed text-fg2">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg2">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}

/** Terms and Privacy links with the operator notice. */
export function LegalFooter({ className = '', tone = 'default' }: { className?: string; tone?: 'default' | 'sidebar' }) {
  const muted = tone === 'sidebar' ? 'text-white/40' : 'text-fg3';
  const link = tone === 'sidebar' ? 'hover:text-white' : 'hover:text-fg';
  return (
    <div className={`text-center text-[11px] leading-relaxed ${muted} ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-3">
        <Link to="/terms" className={link}>
          Terms and Conditions
        </Link>
        <Link to="/privacy" className={link}>
          Privacy Policy
        </Link>
      </div>
      <p className="mt-1">{MADE_BY_NOTICE}</p>
    </div>
  );
}
