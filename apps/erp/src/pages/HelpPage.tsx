import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, LifeBuoy, ListTree, SearchX } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { sectionText, visibleChapters } from './help/guideContent';
import type { GuideChapter, GuideSection, GuideShot } from './help/guideContent';
import { GuideToc } from './help/GuideToc';
import { Lightbox, SectionBlock } from './help/GuideParts';

/** Which chapter (and section) an address hash points at: #repair-orders or #repair-orders-approvals. */
function resolve(hash: string, chapters: GuideChapter[]): { chapter: GuideChapter; section: GuideSection | null } | null {
  for (const chapter of chapters) {
    if (chapter.id === hash) return { chapter, section: null };
    const section = chapter.sections.find((s) => s.id === hash);
    if (section) return { chapter, section };
  }
  return null;
}

function scrollToId(id: string) {
  // After the chapter has rendered.
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** The usage guide: a table of contents, search, one chapter at a time, deep links per section. */
export function HelpPage() {
  const { isPlatformAdmin } = useAuth();
  const chapters = useMemo(() => visibleChapters(isPlatformAdmin), [isPlatformAdmin]);
  const location = useLocation();
  const navigate = useNavigate();
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  const target = resolve(hash, chapters);
  const chapter = target?.chapter ?? chapters[0]!;
  const chapterIndex = chapters.indexOf(chapter);

  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(target?.section?.id ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([chapter.id]));
  const [tocOpen, setTocOpen] = useState(false);
  const [lightbox, setLightbox] = useState<GuideShot | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  // The current chapter is always open in the contents.
  useEffect(() => {
    setExpanded((s) => (s.has(chapter.id) ? s : new Set(s).add(chapter.id)));
  }, [chapter.id]);

  // Follow the address: scroll to the section (or the chapter top) it names.
  useEffect(() => {
    if (!hash) return;
    const found = resolve(hash, chapters);
    if (!found) return;
    setActiveSection(found.section?.id ?? null);
    scrollToId(found.section?.id ?? found.chapter.id);
  }, [hash, location.key, chapters]);

  /** Go to a chapter or section: updates the address (shareable) and scrolls there. */
  const goTo = useCallback(
    (id: string) => {
      setQuery('');
      setTocOpen(false);
      if (decodeURIComponent(window.location.hash.replace(/^#/, '')) === id && hash === id) scrollToId(id);
      else navigate({ hash: id });
    },
    [hash, navigate],
  );

  // While reading, the address follows the section at the top of the screen (without a new history entry).
  const searching = query.trim() !== '';
  useEffect(() => {
    if (searching) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-guide-section]'));
    if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!top) return;
        const id = top.target.id;
        setActiveSection(id);
        if (window.location.hash !== `#${id}`) window.history.replaceState(window.history.state, '', `#${id}`);
      },
      { rootMargin: '-10% 0px -75% 0px' },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [chapter.id, searching]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return chapters
      .map((c) => ({ chapter: c, sections: c.sections.filter((s) => words.every((w) => sectionText(s).includes(w))) }))
      .filter((r) => r.sections.length > 0);
  }, [query, chapters]);
  const resultCount = results.reduce((n, r) => n + r.sections.length, 0);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toc = (
    <GuideToc
      chapters={chapters}
      currentChapter={chapter.id}
      activeSection={activeSection}
      expanded={expanded}
      onToggle={toggle}
      onGo={goTo}
    />
  );

  const prev = chapters[chapterIndex - 1];
  const next = chapters[chapterIndex + 1];
  const ChapterIcon = chapter.icon;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-6">
        {/* Desktop: contents beside the guide, staying in view. */}
        <aside className="no-scrollbar glass sticky top-0 hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto rounded-xl p-2.5 lg:block">
          <p className="px-2.5 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wider text-fg3">Contents</p>
          {toc}
        </aside>

        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <LifeBuoy className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-sm font-semibold text-fg">How to use EuroWerken</h2>
                  <p className="mt-0.5 text-xs text-fg2">
                    Step-by-step help for every page. Pick a chapter, or search for a button or task.
                  </p>
                </div>
              </div>
              <SearchInput value={query} onChange={setQuery} placeholder="Search the guide" className="w-full sm:w-64" />
            </div>
          </Card>

          {/* Phone and tablet: contents in a dropdown. */}
          <div className="glass rounded-2xl lg:hidden">
            <button
              type="button"
              onClick={() => setTocOpen((o) => !o)}
              aria-expanded={tocOpen}
              aria-controls="guide-toc-mobile"
              className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left text-xs coarse:min-h-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ListTree className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-fg3">Contents · </span>
                <span className="font-semibold text-fg">
                  {chapterIndex + 1}. {chapter.title}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-fg3 transition-transform ${tocOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {tocOpen && (
              <div id="guide-toc-mobile" className="max-h-[60dvh] overflow-y-auto border-t border-line px-2 pb-2 pt-2">
                {toc}
              </div>
            )}
          </div>

          <p aria-live="polite" className="sr-only">
            {searching ? `${resultCount} matching section${resultCount === 1 ? '' : 's'}.` : ''}
          </p>

          {searching ? (
            resultCount === 0 ? (
              <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <SearchX className="h-7 w-7 text-fg3" aria-hidden />
                <p className="text-sm text-fg2">Nothing in the guide matches "{query.trim()}".</p>
                <p className="text-[11px] text-fg3">Try a shorter word, such as the name of a button or page.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-fg2">
                  {resultCount} matching section{resultCount === 1 ? '' : 's'}. Press a title to read it in its chapter.
                </p>
                {results.flatMap((r) =>
                  r.sections.map((s) => (
                    <SectionBlock key={s.id} section={s} onOpen={setLightbox} onTitleClick={goTo} eyebrow={r.chapter.title} />
                  )),
                )}
              </div>
            )
          ) : (
            <article aria-labelledby={`${chapter.id}-heading`} className="space-y-4">
              <header id={chapter.id} className="scroll-mt-4 px-1 pt-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-fg3">
                  Chapter {chapterIndex + 1} of {chapters.length}
                </p>
                <h2 id={`${chapter.id}-heading`} className="mt-1 flex items-center gap-2 font-display text-xl font-semibold text-fg">
                  <ChapterIcon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  {chapter.title}
                </h2>
                <p className="mt-1 max-w-2xl text-xs text-fg2">{chapter.summary}</p>
                {chapter.sections.length > 1 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Sections in ${chapter.title}`}>
                    {chapter.sections.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                            e.preventDefault();
                            goTo(s.id);
                          }}
                          className="inline-flex rounded-full glass-field px-2.5 py-1 text-[11px] text-fg2 transition hover:border-accent hover:text-fg coarse:min-h-10 coarse:items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </header>

              {chapter.sections.map((s) => (
                <SectionBlock key={s.id} section={s} onOpen={setLightbox} onTitleClick={goTo} />
              ))}

              <nav aria-label="Chapters" className="grid gap-3 pt-2 sm:grid-cols-2">
                {prev ? (
                  <button
                    type="button"
                    onClick={() => goTo(prev.id)}
                    className="glass flex items-center gap-3 rounded-xl p-4 text-left transition hover:border-accent/50 coarse:min-h-14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-wider text-fg3">Previous</span>
                      <span className="block truncate text-xs font-semibold text-fg">{prev.title}</span>
                    </span>
                  </button>
                ) : (
                  <span className="hidden sm:block" />
                )}
                {next && (
                  <button
                    type="button"
                    onClick={() => goTo(next.id)}
                    className="glass flex items-center justify-end gap-3 rounded-xl p-4 text-right transition hover:border-accent/50 coarse:min-h-14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-wider text-fg3">Next</span>
                      <span className="block truncate text-xs font-semibold text-fg">{next.title}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  </button>
                )}
              </nav>
            </article>
          )}
        </div>
      </div>

      <Lightbox shot={lightbox} onClose={closeLightbox} />
    </div>
  );
}
