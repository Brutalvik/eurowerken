/**
 * HelcimPay.js in the browser (https://devdocs.helcim.com/docs/render-helcimpayjs).
 *
 * Loads Helcim's script once, opens its payment window with the checkoutToken from the payments Edge Function, and
 * waits for the window's message: eventName 'helcim-pay-js-' + checkoutToken, eventStatus SUCCESS (approved),
 * ABORTED (declined) or HIDE (closed), eventMessage the transaction response (a JSON string) on SUCCESS.
 * Card details are typed only inside Helcim's window; this code never sees them. The response is passed as is to
 * the server, which checks Helcim's hash and re-reads the transaction from Helcim before anything is recorded.
 *
 * The same file is in apps/customer/src/components/payments/helcimPay.ts; keep both alike.
 */

const SCRIPT_URL = 'https://secure.helcim.app/helcim-pay/services/start.js';

declare global {
  interface Window {
    appendHelcimPayIframe?: (checkoutToken: string, allowExit?: boolean) => void;
    removeHelcimPayIframe?: () => void;
  }
}

let loading: Promise<void> | null = null;

/** Loads Helcim's script (once). */
export function loadHelcimPay(): Promise<void> {
  if (typeof window.appendHelcimPayIframe === 'function') return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (typeof window.appendHelcimPayIframe === 'function' ? resolve() : reject(new Error('The Helcim payment window did not load.')));
    s.onerror = () => reject(new Error('The Helcim payment window could not be loaded. Check your connection, or turn off a blocker for secure.helcim.app.'));
    document.head.appendChild(s);
  }).catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

export type HelcimOutcome =
  | { kind: 'success'; response: unknown }
  | { kind: 'closed'; declined: boolean };

/** Messages only count from Helcim's own pages. */
function fromHelcim(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'helcim.app' || host.endsWith('.helcim.app') || host === 'helcim.com' || host.endsWith('.helcim.com');
  } catch {
    return false;
  }
}

/**
 * Opens the payment window and resolves once: with the transaction response when the card was approved, or with
 * closed when the window was closed first (declined: true if Helcim reported a decline before that).
 */
export async function payWithHelcim(checkoutToken: string): Promise<HelcimOutcome> {
  await loadHelcimPay();
  return new Promise<HelcimOutcome>((resolve) => {
    const key = `helcim-pay-js-${checkoutToken}`;
    let declined = false;
    let done = false;
    const finish = (outcome: HelcimOutcome) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      try {
        window.removeHelcimPayIframe?.();
      } catch {
        // Already gone.
      }
      resolve(outcome);
    };
    function onMessage(event: MessageEvent) {
      const d = event.data as { eventName?: unknown; eventStatus?: unknown; eventMessage?: unknown } | null;
      if (!d || typeof d !== 'object' || d.eventName !== key) return;
      if (!fromHelcim(event.origin)) return;
      if (d.eventStatus === 'SUCCESS') finish({ kind: 'success', response: d.eventMessage });
      else if (d.eventStatus === 'ABORTED') declined = true;
      else if (d.eventStatus === 'HIDE') finish({ kind: 'closed', declined });
    }
    window.addEventListener('message', onMessage);
    window.appendHelcimPayIframe?.(checkoutToken, true);
  });
}

// Confirmations not yet acknowledged by the server (a lost connection or a closed tab right after paying) are kept
// here and sent again the next time a payment screen opens. The response holds no card number (Helcim sends only
// the first 6 and last 4 digits), and it is removed as soon as the server has answered.
const PENDING_KEY = 'ew-helcim-pending';

interface PendingConfirm {
  checkout_id: string;
  response: unknown;
  at: number;
}

function readPending(): PendingConfirm[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as PendingConfirm[]) : [];
    // Older than 7 days: staff record those from the Helcim transaction number.
    return Array.isArray(list) ? list.filter((p) => p && typeof p.checkout_id === 'string' && Date.now() - p.at < 7 * 864e5) : [];
  } catch {
    return [];
  }
}

function writePending(list: PendingConfirm[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the confirmation is still sent now.
  }
}

export function rememberPendingConfirm(checkoutId: string, response: unknown) {
  writePending([...readPending().filter((p) => p.checkout_id !== checkoutId), { checkout_id: checkoutId, response, at: Date.now() }]);
}

export function forgetPendingConfirm(checkoutId: string) {
  writePending(readPending().filter((p) => p.checkout_id !== checkoutId));
}

export function pendingConfirms(): PendingConfirm[] {
  return readPending();
}
