import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ImageOff, Info, Lightbulb, X, ZoomIn } from 'lucide-react';
import type { CalloutKind, GuideSection, GuideShot, GuideStep } from './guideContent';

/** Text with **bold** button and field names. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-fg">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const CALLOUT: Record<CalloutKind, { icon: typeof Info; label: string; className: string; iconClass: string }> = {
  tip: { icon: Lightbulb, label: 'Tip', className: 'border-ok/30 bg-ok/10', iconClass: 'text-ok' },
  warning: { icon: AlertTriangle, label: 'Careful', className: 'border-warn/40 bg-warn/10', iconClass: 'text-warn' },
  note: { icon: Info, label: 'Note', className: 'border-accent/30 bg-accent/10', iconClass: 'text-accent' },
};

function Callout({ kind, text }: { kind: CalloutKind; text: string }) {
  const c = CALLOUT[kind];
  const Icon = c.icon;
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-xs text-fg2 ${c.className}`}>
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${c.iconClass}`} aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold text-fg">{c.label}: </span>
        <Rich text={text} />
      </p>
    </div>
  );
}

/** A framed screenshot with caption; opens large on click. Shows a placeholder when the file is missing. */
function Figure({ shot, onOpen }: { shot: GuideShot; onOpen: (s: GuideShot) => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="overflow-hidden rounded-xl glass-field">
      {failed ? (
        <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 border-b border-dashed border-line px-6 text-center">
          <ImageOff className="h-6 w-6 text-fg3" aria-hidden />
          <p className="max-w-sm text-[11px] text-fg2">{shot.alt}</p>
          <p className="font-mono text-[10px] text-fg3">Screenshot coming soon</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(shot)}
          className="group relative block w-full border-b border-line focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          aria-label={`Enlarge screenshot: ${shot.alt}`}
        >
          <img src={shot.src} alt={shot.alt} loading="lazy" onError={() => setFailed(true)} className="block h-auto w-full" />
          <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 coarse:opacity-100">
            <ZoomIn className="h-4 w-4" aria-hidden />
          </span>
        </button>
      )}
      <figcaption className="px-3 py-2 text-[11px] text-fg3">{shot.caption}</figcaption>
    </figure>
  );
}

/** Full-screen view of one screenshot. Escape, the close button or a click outside closes it. */
export function Lightbox({ shot, onClose }: { shot: GuideShot | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shot) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Only one focusable control: keep Tab on it.
      if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [shot, onClose]);

  if (!shot) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={shot.alt}
      className="pt-safe pb-safe fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close screenshot"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
      <img
        src={shot.src}
        alt={shot.alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] max-w-full rounded-lg object-contain shadow-2xl"
      />
      <p className="mt-3 max-w-2xl text-center text-xs text-white/80" onClick={(e) => e.stopPropagation()}>
        {shot.caption}
      </p>
    </div>,
    document.body,
  );
}

function Step({ step, number, onOpen }: { step: GuideStep; number: number; onOpen: (s: GuideShot) => void }) {
  return (
    <li className="flex gap-3 sm:gap-4">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent font-display text-xs font-semibold text-accent-fg shadow-sm"
        aria-hidden
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5 pb-1">
        <h4 className="pt-1 text-sm font-semibold text-fg">
          <span className="sr-only">Step {number}: </span>
          {step.title}
        </h4>
        <p className="text-xs leading-relaxed text-fg2">
          <Rich text={step.body} />
        </p>
        {step.callout && <Callout kind={step.callout.kind} text={step.callout.text} />}
        {step.shot && <Figure shot={step.shot} onOpen={onOpen} />}
      </div>
    </li>
  );
}

const linkClass =
  'inline-flex items-center gap-1 rounded text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11';

/** One section: anchor, title, summary, optional page link and its numbered steps. */
export function SectionBlock({
  section,
  onOpen,
  eyebrow,
  onTitleClick,
}: {
  section: GuideSection;
  onOpen: (s: GuideShot) => void;
  /** Called instead of following the title link (the link still works to copy or open in a new tab). */
  onTitleClick?: (id: string) => void;
  /** Shown above the title in search results (the chapter name). */
  eyebrow?: ReactNode;
}) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="glass scroll-mt-4 rounded-xl p-4 sm:p-5" data-guide-section>
      {eyebrow && <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-fg3">{eyebrow}</p>}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id={`${section.id}-title`} className="font-display text-base font-semibold text-fg">
            <a
              href={`#${section.id}`}
              onClick={(e) => {
                if (!onTitleClick || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                onTitleClick(section.id);
              }}
              className="rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              {section.title}
            </a>
          </h3>
          {section.summary && <p className="mt-1 text-xs text-fg2">{section.summary}</p>}
        </div>
        {section.page && (
          <Link to={section.page.to} className={linkClass}>
            {section.page.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <ol className="space-y-5">
        {section.steps.map((step, i) => (
          <Step key={`${section.id}-${i}`} step={step} number={i + 1} onOpen={onOpen} />
        ))}
      </ol>
    </section>
  );
}
