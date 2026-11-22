import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { toIsoDate } from './Calendar';
import { EMPTY_FORM, URGENCY, isSlotValue } from './model';
import type { FormState } from './model';

const KEY_PREFIX = 'ew-book-draft';
const VERSION = 1;

interface StoredDraft {
  v: number;
  form: FormState;
  /** Furthest step reached, so the rail can jump forward again after an edit. */
  furthest: number;
}

function storageKey(slug: string): string {
  return `${KEY_PREFIX}:${slug}`;
}

/** Keeps only fields of the right type, so an old or edited draft cannot break the page. */
function sanitize(raw: unknown): FormState {
  const out: FormState = { ...EMPTY_FORM, services: [] };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  const target = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    const value = src[key];
    const def = EMPTY_FORM[key];
    if (Array.isArray(def)) {
      if (Array.isArray(value)) target[key] = value.filter((x): x is string => typeof x === 'string').slice(0, 50);
    } else if (typeof value === typeof def) {
      target[key] = typeof value === 'string' ? value.slice(0, 1000) : value;
    }
  }
  if (!URGENCY.some((u) => u.id === out.urgency)) out.urgency = 'routine';
  // Older drafts kept the time as "09:00", and a saved time may have passed: drop those, keep the rest.
  const yesterday = toIsoDate(new Date(Date.now() - 86_400_000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date) || out.date < yesterday) out.date = '';
  if (!out.date || !isSlotValue(out.time) || Date.parse(out.time) <= Date.now()) out.time = '';
  return out;
}

function readDraft(slug: string): StoredDraft | null {
  try {
    const text = window.sessionStorage.getItem(storageKey(slug));
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<StoredDraft>;
    if (parsed.v !== VERSION) return null;
    const furthest = typeof parsed.furthest === 'number' && parsed.furthest >= 0 ? Math.floor(parsed.furthest) : 0;
    return { v: VERSION, form: sanitize(parsed.form), furthest };
  } catch {
    return null;
  }
}

/**
 * The booking draft, saved in sessionStorage per site so a reload keeps it.
 * preselect: ?service= and ?tech= from the link that opened the page.
 */
export function useBookingDraft(
  slug: string,
  preselect: { service: string | null; expert: string | null },
): {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  furthest: number;
  setFurthest: Dispatch<SetStateAction<number>>;
  clearDraft: () => void;
} {
  const [initial] = useState(() => {
    const saved = readDraft(slug);
    const form = saved?.form ?? { ...EMPTY_FORM, services: [] };
    if (preselect.service && !form.services.includes(preselect.service)) form.services = [...form.services, preselect.service];
    if (preselect.expert) form.expert = preselect.expert;
    return { form, furthest: saved?.furthest ?? 0 };
  });
  const [form, setForm] = useState<FormState>(initial.form);
  const [furthest, setFurthest] = useState(initial.furthest);
  const paused = useRef(false);

  useEffect(() => {
    if (paused.current) return;
    try {
      const draft: StoredDraft = { v: VERSION, form, furthest };
      window.sessionStorage.setItem(storageKey(slug), JSON.stringify(draft));
    } catch {
      // Private mode without storage: the draft simply is not kept.
    }
  }, [slug, form, furthest]);

  /** Removes the saved draft (after confirming); later changes are not saved again. */
  const clearDraft = useCallback(() => {
    paused.current = true;
    try {
      window.sessionStorage.removeItem(storageKey(slug));
    } catch {
      // Nothing stored.
    }
  }, [slug]);

  return { form, setForm, furthest, setFurthest, clearDraft };
}
