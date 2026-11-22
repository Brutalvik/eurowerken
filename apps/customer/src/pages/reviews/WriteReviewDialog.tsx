import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { CheckCircle2, Star, X } from 'lucide-react';
import { DemoNotice } from '@/components/ui';

const RATING_WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/**
 * Modal for writing a review. Focus moves into the dialog on open, Tab stays
 * inside it, Escape closes it, and the caller returns focus to its trigger.
 */
export function WriteReviewDialog({ workshopName, onClose }: { workshopName: string; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Lock page scroll and focus the first control.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (submitted) doneRef.current?.focus();
  }, [submitted]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    );
    // Radio groups expose one tab stop; skip unchecked radios except when none is checked.
    const focusable = Array.from(items).filter(
      (el) => !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked && rating !== 0),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating === 0) {
      setError('Please choose a star rating.');
      return;
    }
    setError('');
    setSubmitted(true);
  }

  const shown = hover || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" onKeyDown={onKeyDown}>
      <div aria-hidden className="absolute inset-0 bg-sidebar/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-strong relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-xl font-bold text-fg">
            {submitted ? 'Thank you for your review' : 'Write a Review'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg2 transition hover:bg-surface2 hover:text-fg coarse:h-11 coarse:w-11"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {submitted ? (
          <div className="mt-5 space-y-5 pb-2">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-fg2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
              Thanks for telling us about your visit to {workshopName}. Your feedback helps other drivers and helps our team improve.
            </p>
            <DemoNotice>
              Reviews are checked by the workshop before they appear. Online reviews are not saved yet, so this one has not been
              stored.
            </DemoNotice>
            <button ref={doneRef} type="button" onClick={onClose} className="btn-ink w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4 pb-2">
            <fieldset>
              <legend className="label">Your rating</legend>
              <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label
                    key={n}
                    onMouseEnter={() => setHover(n)}
                    className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent coarse:h-11 coarse:w-11"
                  >
                    <input
                      ref={n === 1 ? firstRef : undefined}
                      type="radio"
                      name="rating"
                      value={n}
                      checked={rating === n}
                      onChange={() => {
                        setRating(n);
                        setError('');
                      }}
                      className="sr-only"
                    />
                    <Star className={`h-7 w-7 ${n <= shown ? 'fill-warn text-warn' : 'text-line'}`} aria-hidden />
                    <span className="sr-only">
                      {n} star{n === 1 ? '' : 's'}, {RATING_WORDS[n - 1]}
                    </span>
                  </label>
                ))}
                <span className="ml-2 text-sm font-medium text-fg2" aria-hidden>
                  {shown ? RATING_WORDS[shown - 1] : ''}
                </span>
              </div>
              {error && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-bad">
                  {error}
                </p>
              )}
            </fieldset>

            <div>
              <label htmlFor="review-title" className="label">
                Title
              </label>
              <input id="review-title" name="title" className="input" required maxLength={80} placeholder="Sum up your visit" />
            </div>
            <div>
              <label htmlFor="review-body" className="label">
                Your review
              </label>
              <textarea
                id="review-body"
                name="body"
                className="input min-h-[120px] resize-y"
                required
                minLength={10}
                maxLength={2000}
                placeholder="What was done, how was the communication, would you come back?"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="review-car" className="label">
                  Your car
                </label>
                <input id="review-car" name="car" className="input" placeholder="2021 BMW X5" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="review-name" className="label">
                  Your name
                </label>
                <input id="review-name" name="name" className="input" required autoComplete="name" placeholder="First name and initial" />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="btn-outline">
                Cancel
              </button>
              <button type="submit" className="btn-ink">
                Submit review
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
