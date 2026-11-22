import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { COMPANY, LEGAL_DRAFT, LEGAL_EFFECTIVE_DATE, MADE_BY_NOTICE } from '@eurowerken/shared';
import type { LegalDocument } from '@eurowerken/shared';

/**
 * Terms or Privacy (shared text, packages/shared/src/legal.ts). Inside a
 * workshop site it sits in the site layout; at /terms and /privacy it stands alone.
 */
export function LegalPage({ doc, standalone = false }: { doc: LegalDocument; standalone?: boolean }) {
  const body = (
    <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-10">
      <h1 className="font-display text-2xl font-bold text-fg sm:text-3xl">{doc.title}</h1>
      <p className="mt-1 text-xs text-fg3">
        {MADE_BY_NOTICE} Effective {LEGAL_EFFECTIVE_DATE}.
      </p>
      {LEGAL_DRAFT && (
        <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          Draft under review. This text may change before it takes effect.
        </p>
      )}
      <p className="mt-6 text-sm leading-relaxed text-fg2">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="mt-7">
          <h2 className="font-display text-base font-semibold text-fg">{s.heading}</h2>
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
  );

  if (!standalone) return <div className="container-site py-10 sm:py-14">{body}</div>;

  return (
    <div className="pt-safe pb-safe min-h-[100dvh] bg-bg px-4 py-10">
      <div className="mx-auto mb-6 max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {COMPANY.product}
        </Link>
      </div>
      {body}
    </div>
  );
}
