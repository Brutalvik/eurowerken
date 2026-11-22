import { useEffect, useState } from 'react';
import { BadgeCheck, Camera, Check, Share2, Star, ThumbsUp, User, Wrench } from 'lucide-react';
import { Photo } from '@/components/Photo';
import { Stars } from '@/components/ui';
import type { Review } from '@/data/catalog';

/** "2 days ago", "1 week ago", "2 months ago". */
export function timeAgo(days: number): string {
  if (days < 1) return 'Today';
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w === 1 ? '' : 's'} ago`;
  }
  const m = Math.floor(days / 30);
  return `${m} month${m === 1 ? '' : 's'} ago`;
}

const SMALL_BTN =
  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-fg2 transition hover:bg-surface2 hover:text-fg coarse:min-h-11';

export function ReviewCard({
  review,
  workshopName,
  voted,
  onHelpful,
}: {
  review: Review;
  workshopName: string;
  voted: boolean;
  onHelpful: () => void;
}) {
  const [share, setShare] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (share === 'idle') return;
    const t = window.setTimeout(() => setShare('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [share]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShare('copied');
    } catch {
      setShare('failed');
    }
  }

  const titleId = `review-${review.id}-title`;

  return (
    <article aria-labelledby={titleId} className="glass relative overflow-hidden rounded-2xl p-5 sm:p-6">
      {review.featured && (
        <span className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-bl-xl bg-warn/15 px-3 py-1 text-[11px] font-semibold text-warn">
          <Star className="h-3 w-3 fill-warn" aria-hidden />
          Featured
        </span>
      )}

      <header className={`flex items-start gap-3 ${review.featured ? 'pr-20' : ''}`}>
        {review.avatar ? (
          <Photo name={review.avatar} alt="" icon={User} className="h-11 w-11 shrink-0 rounded-full" />
        ) : (
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 font-display text-base font-semibold text-accent"
          >
            {review.author.charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-fg">{review.author}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg3">
            <span className="inline-flex items-center gap-1 rounded-md bg-ok/12 px-1.5 py-0.5 text-[11px] font-semibold text-ok">
              <BadgeCheck className="h-3 w-3" aria-hidden />
              {review.verified}
            </span>
            <span>{review.car}</span>
          </p>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <Stars rating={review.rating} />
        <span className="text-xs text-fg3">{timeAgo(review.daysAgo)}</span>
      </div>

      <h3 id={titleId} className="mt-3 font-semibold text-fg">
        {review.title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-fg2">{review.body}</p>

      {review.photos && review.photos.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Photos from the customer">
          {review.photos.map((p, i) => (
            <li key={p}>
              <Photo
                name={p}
                alt={`Photo ${i + 1} from ${review.author}'s review`}
                icon={Camera}
                label="Customer photo"
                className="h-20 w-24 rounded-xl border border-line sm:h-24 sm:w-28"
              />
            </li>
          ))}
        </ul>
      )}

      {review.response && (
        <div className="mt-4 rounded-xl border-l-2 border-accent bg-surface2/70 p-4 sm:ml-6">
          <p className="flex items-center gap-2 text-xs font-semibold text-fg">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-bg">
              <Wrench className="h-3.5 w-3.5" aria-hidden />
            </span>
            {workshopName} Response
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg2">{review.response}</p>
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onHelpful}
          disabled={voted}
          aria-pressed={voted}
          className={`${SMALL_BTN} ${voted ? 'text-accent disabled:hover:bg-transparent disabled:hover:text-accent' : ''}`}
        >
          <ThumbsUp className={`h-3.5 w-3.5 ${voted ? 'fill-accent/20' : ''}`} aria-hidden />
          Helpful ({review.helpful + (voted ? 1 : 0)})
        </button>
        <button type="button" onClick={() => void copyLink()} className={SMALL_BTN}>
          {share === 'copied' ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Share2 className="h-3.5 w-3.5" aria-hidden />}
          Share
        </button>
        <span aria-live="polite" className="text-xs font-medium text-ok">
          {share === 'copied' && 'Link copied'}
          {share === 'failed' && <span className="text-bad">Could not copy the link</span>}
        </span>
      </footer>
    </article>
  );
}
