/**
 * Turns a spoken or typed command into an intent. Pure (no React, no network), so it is easy to test and reason
 * about. The voice overlay runs the intent with the app's own navigation, page actions and theme switches.
 */

export interface NavTarget {
  /** Route path without the leading slash, e.g. "appointments". */
  path: string;
  label: string;
}

/** Actions a page runs when it is opened with { voiceAction } in its router state (see useVoiceAction). */
export type PageAction = 'new-appointment' | 'add-part';

export type Intent =
  | { kind: 'navigate'; path: string; label: string }
  | { kind: 'open-repair'; number: string }
  | { kind: 'page-action'; path: string; action: PageAction; label: string }
  | { kind: 'search-history'; query: string }
  | { kind: 'contrast'; on: boolean | 'toggle' }
  | { kind: 'theme'; mode: 'light' | 'dark' | 'toggle' }
  | { kind: 'back' }
  | { kind: 'unknown'; text: string };

/** Extra words people use for each page. Labels from the sidebar are matched too. */
const SYNONYMS: Record<string, string[]> = {
  dashboard: ['dashboard', 'home', 'overview', 'start'],
  appointments: ['appointments', 'appointment', 'calendar', 'bookings', 'booking', 'schedule'],
  inventory: ['parts inventory', 'inventory', 'parts', 'stock'],
  purchasing: ['purchasing', 'purchase orders', 'purchase order', 'suppliers', 'supplier'],
  'repair-orders': ['repair orders', 'repair order', 'repairs', 'jobs', 'work orders', 'ro list'],
  'service-history': ['service history', 'history', 'vehicle history'],
  customers: ['customers', 'customer', 'clients', 'contacts'],
  sales: ['sales', 'orders', 'shop orders'],
  invoices: ['invoices', 'invoice', 'billing', 'payments'],
  reports: ['reports', 'report', 'analytics', 'stats', 'statistics'],
  users: ['users and roles', 'users', 'roles', 'staff', 'team members', 'permissions'],
  settings: ['settings', 'preferences', 'setup'],
  help: ['help', 'guide', 'how to'],
  admin: ['platform admin', 'admin'],
};

const NAV_VERBS = /^(?:please\s+)?(?:go to|go|open|show(?: me)?|take me to|navigate to|switch to|view|display)\s+(?:the\s+)?/;

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'’.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "RO 1", "r.o. 12", "repair order number 7", "RO-0001" → "RO-0001". */
export function repairNumberIn(text: string): string | null {
  const t = text.toLowerCase().replace(/\./g, '');
  // "purchase order 3" is not a repair order.
  const m = /\b(?:ro|r o|repair order|repair|work order|(?<!purchase )order)\s*(?:number|no|#)?\s*-?\s*(\d{1,6})\b/.exec(t);
  if (!m) return null;
  return `RO-${m[1].padStart(4, '0')}`;
}

/**
 * Reads a command. `pages` are the pages this person may open (from the sidebar), so a voice command never offers
 * a page their role cannot see.
 */
export function parseCommand(raw: string, pages: NavTarget[]): Intent {
  const text = clean(raw);
  if (!text) return { kind: 'unknown', text: raw };
  const allowed = new Set(pages.map((p) => p.path));

  // Accessibility and theme
  if (/\b(high contrast|contrast mode|contrast)\b/.test(text)) {
    if (/\b(off|disable|turn off|stop|normal|standard)\b/.test(text)) return { kind: 'contrast', on: false };
    if (/\b(on|enable|turn on|start)\b/.test(text)) return { kind: 'contrast', on: true };
    return { kind: 'contrast', on: 'toggle' };
  }
  if (/\b(dark mode|dark theme|night mode)\b/.test(text)) return { kind: 'theme', mode: 'dark' };
  if (/\b(light mode|light theme|day mode)\b/.test(text)) return { kind: 'theme', mode: 'light' };
  if (/\b(toggle theme|switch theme|change theme)\b/.test(text)) return { kind: 'theme', mode: 'toggle' };
  if (/^(go )?back$|^go back\b|^previous page$/.test(text)) return { kind: 'back' };

  // A specific repair order
  const ro = repairNumberIn(text);
  if (ro && allowed.has('repair-orders')) return { kind: 'open-repair', number: ro };

  // Page actions
  if (/\b(new|create|add|book|make)\b.*\b(appointment|booking)\b/.test(text) && allowed.has('appointments')) {
    return { kind: 'page-action', path: 'appointments', action: 'new-appointment', label: 'New appointment' };
  }
  if (/\b(add|new|create)\b.*\bpart\b|\bto (the )?inventory\b/.test(text) && allowed.has('inventory')) {
    return { kind: 'page-action', path: 'inventory', action: 'add-part', label: 'Add part' };
  }

  // Search service history: "search BMW", "find plate CYV3690", "look up John Smith"
  const search = /^(?:search(?: for)?|find|look up|lookup)\s+(.+)$/.exec(text);
  if (search && allowed.has('service-history')) {
    const query = raw.trim().replace(/^(?:search(?: for)?|find|look up|lookup)\s+/i, '').replace(/[.?!]+$/, '').trim();
    if (query.length >= 2) return { kind: 'search-history', query };
  }

  // Pages: longest matching phrase wins ("purchase orders" before "orders").
  const target = text.replace(NAV_VERBS, '').replace(/\s+(page|tab|screen)$/, '');
  let best: { path: string; label: string; len: number } | null = null;
  for (const page of pages) {
    const words = [page.label.toLowerCase(), ...(SYNONYMS[page.path] ?? [])];
    for (const w of words) {
      const hit = target === w || new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(target);
      if (hit && (!best || w.length > best.len)) best = { path: page.path, label: page.label, len: w.length };
    }
  }
  if (best) return { kind: 'navigate', path: best.path, label: best.label };

  return { kind: 'unknown', text: raw };
}

/** Suggested commands shown as one-tap chips, limited to what this person can open. */
export function suggestionsFor(pages: NavTarget[]): string[] {
  const allowed = new Set(pages.map((p) => p.path));
  const out: string[] = [];
  if (allowed.has('appointments')) out.push('Go to Appointments');
  if (allowed.has('repair-orders')) out.push('Open RO-0001');
  if (allowed.has('appointments')) out.push('New appointment');
  if (allowed.has('inventory')) out.push('Add part to inventory');
  if (allowed.has('service-history')) out.push('Search BMW');
  out.push('Toggle high contrast');
  if (allowed.has('dashboard')) out.push('Go to Dashboard');
  return out;
}
