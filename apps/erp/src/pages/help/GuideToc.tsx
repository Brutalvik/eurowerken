import { ChevronDown } from 'lucide-react';
import type { GuideChapter } from './guideContent';

interface GuideTocProps {
  chapters: GuideChapter[];
  currentChapter: string;
  activeSection: string | null;
  expanded: Set<string>;
  onToggle: (chapterId: string) => void;
  onGo: (id: string) => void;
}

/** Table of contents: chapters, each expandable to its sections. Used in the desktop sidebar and the phone dropdown. */
export function GuideToc({ chapters, currentChapter, activeSection, expanded, onToggle, onGo }: GuideTocProps) {
  return (
    <nav aria-label="Guide contents">
      <ol className="space-y-0.5">
        {chapters.map((chapter, index) => {
          const Icon = chapter.icon;
          const isCurrent = chapter.id === currentChapter;
          const open = expanded.has(chapter.id);
          return (
            <li key={chapter.id}>
              <div className="flex items-center gap-0.5">
                <a
                  href={`#${chapter.id}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    onGo(chapter.id);
                  }}
                  aria-current={isCurrent && !activeSection ? 'location' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition coarse:min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    isCurrent ? 'bg-accent/15 font-semibold text-fg' : 'text-fg2 hover:bg-surface2/70 hover:text-fg'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? 'text-accent' : 'text-fg3'}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="mr-1 tabular-nums text-fg3">{index + 1}.</span>
                    {chapter.title}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => onToggle(chapter.id)}
                  aria-expanded={open}
                  aria-label={`${open ? 'Hide' : 'Show'} sections of ${chapter.title}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg3 hover:bg-surface2/70 hover:text-fg coarse:h-11 coarse:w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </div>
              {open && (
                <ol className="mb-1 ml-[1.15rem] mt-0.5 space-y-0.5 border-l border-line pl-2">
                  {chapter.sections.map((section) => {
                    const active = section.id === activeSection;
                    return (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                            e.preventDefault();
                            onGo(section.id);
                          }}
                          aria-current={active ? 'location' : undefined}
                          className={`block rounded-md px-2 py-1.5 text-[11px] leading-snug transition coarse:py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                            active ? 'bg-surface2 font-semibold text-accent' : 'text-fg2 hover:bg-surface2/60 hover:text-fg'
                          }`}
                        >
                          {section.title}
                        </a>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
