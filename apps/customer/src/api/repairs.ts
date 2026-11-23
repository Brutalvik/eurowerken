/**
 * Repair tracking on real data (supabase/migrations/012 and 013).
 *
 * Guests and signed-in customers alike look a repair up with its tracking code
 * and the email or phone they booked with (track_repair). The server answers
 * every failure with one generic message, so codes cannot be probed.
 *
 * The contact is personal data: it is kept in sessionStorage for this tab only,
 * never in the URL and never logged. Signed-in customers can open their own
 * repairs with their account email; the server also accepts the owner's session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { publicImageUrl } from '@eurowerken/shared';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useSite } from '@/site/SiteContext';

// Types ---------------------------------------------------------------------------------

export type RepairStatus = 'checked_in' | 'diagnosing' | 'awaiting_approval' | 'in_progress' | 'quality_check' | 'ready' | 'completed' | 'cancelled';
export type ItemApproval = 'approved' | 'pending' | 'declined';
export type ItemKind = 'service' | 'labour' | 'part' | 'fee';
export type Decision = 'approved' | 'declined';

export interface RepairVehicle {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  vin?: string | null;
  plate?: string | null;
}

export interface RepairTechnician {
  name: string;
  role: string | null;
  photo_path: string | null;
}

export interface RepairSummary {
  id: string;
  number: string;
  tracking_code: string;
  status: RepairStatus;
  vehicle: RepairVehicle;
  contact_name: string;
  urgency: 'routine' | 'soon' | 'urgent';
  customer_notes: string | null;
  labour_rate: number;
  promised_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  time_zone: string | null;
  /** The repair belongs to a customer account (booked signed in, or linked on the first signed-in approval). */
  linked_to_account: boolean;
  technician: RepairTechnician | null;
}

/** How a decision was made: online by the signed-in customer, or by phone, recorded by staff (migration 018). */
export type DecisionMethod = 'online' | 'phone';

/** The recorded decision on an item (the latest, from repair_item_approvals). */
export interface ItemDecision {
  decision: Decision;
  method: DecisionMethod;
  decided_at: string;
}

export interface RepairItem {
  id: string;
  kind: ItemKind;
  description: string;
  quantity: number;
  unit_price: number;
  approval: ItemApproval;
  /** The recorded decision, or null while none is recorded (pending, or decided before records began). */
  decision: ItemDecision | null;
}

export interface RepairEvent {
  id: string;
  kind: 'status' | 'note' | 'check_in' | 'approval';
  title: string;
  body: string | null;
  created_at: string;
}

export interface RepairMedia {
  id: string;
  kind: 'photo' | 'video';
  path: string;
  caption: string | null;
  created_at?: string;
}

export interface RepairMessage {
  id: string;
  sender: 'staff' | 'customer';
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface TrackedRepair {
  repair: RepairSummary;
  items: RepairItem[];
  events: RepairEvent[];
  media: RepairMedia[];
  messages: RepairMessage[];
}

/** A row of the signed-in customer's own repair_orders (RLS), for quick lists. */
export interface MyRepair {
  id: string;
  number: string;
  tracking_code: string;
  status: RepairStatus;
  vehicle: RepairVehicle;
  created_at: string;
  updated_at: string;
  promised_at: string | null;
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

export const NOT_FOUND_MESSAGE =
  'We could not find a repair with those details. Check the tracking code and the email or phone you booked with.';

// Labels and progress -------------------------------------------------------------------

export const STATUS_LABEL: Record<RepairStatus, string> = {
  checked_in: 'Checked in',
  diagnosing: 'Diagnosing',
  awaiting_approval: 'Awaiting approval',
  in_progress: 'In progress',
  quality_check: 'Quality check',
  ready: 'Ready for pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Rough share of the job done at each status, for progress bars. */
export const STATUS_PROGRESS: Record<RepairStatus, number> = {
  checked_in: 10,
  diagnosing: 25,
  awaiting_approval: 40,
  in_progress: 60,
  quality_check: 80,
  ready: 95,
  completed: 100,
  cancelled: 0,
};

/** The steps of a repair in order (cancelled is not a step). */
export const STATUS_STEPS: Exclude<RepairStatus, 'cancelled'>[] = [
  'checked_in',
  'diagnosing',
  'awaiting_approval',
  'in_progress',
  'quality_check',
  'ready',
  'completed',
];

export const ACTIVE_STATUSES: RepairStatus[] = ['checked_in', 'diagnosing', 'awaiting_approval', 'in_progress', 'quality_check', 'ready'];

export function vehicleName(v: RepairVehicle | null | undefined): string {
  if (!v) return 'Your vehicle';
  return [v.year, v.make, v.model].filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(' ') || 'Your vehicle';
}

// Money ------------------------------------------------------------------------------------

export const GST_RATE = 0.05;

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function itemAmount(item: Pick<RepairItem, 'quantity' | 'unit_price'>): number {
  return cents((Number(item.quantity) || 0) * (Number(item.unit_price) || 0));
}

export interface RepairTotals {
  /** Approved items, before tax. */
  subtotal: number;
  gst: number;
  total: number;
  /** Items waiting for the customer's decision, before tax. */
  pending: number;
  pendingCount: number;
}

export function repairTotals(items: RepairItem[]): RepairTotals {
  let subtotal = 0;
  let pending = 0;
  let pendingCount = 0;
  for (const i of items) {
    if (i.approval === 'approved') subtotal += itemAmount(i);
    else if (i.approval === 'pending') {
      pending += itemAmount(i);
      pendingCount += 1;
    }
  }
  subtotal = cents(subtotal);
  const gst = cents(subtotal * GST_RATE);
  return { subtotal, gst, total: cents(subtotal + gst), pending: cents(pending), pendingCount };
}

// URLs ---------------------------------------------------------------------------------------

const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/$/, '');

/** Public URL of a photo or video in the repair-media bucket. */
export function mediaUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/repair-media/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** The technician's photo (team photos are in the public catalogue bucket). */
export function technicianPhotoUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return SUPABASE_URL ? publicImageUrl(SUPABASE_URL, path) : undefined;
}

// Contact for this tab -----------------------------------------------------------------------

const CONTACTS_KEY = 'ew-track-contacts';

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

function readContacts(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(CONTACTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The contact this tab already verified for a code, if any. */
export function recallContact(code: string): string | null {
  const v = readContacts()[normaliseCode(code)];
  return typeof v === 'string' && v.trim() ? v : null;
}

export function rememberContact(code: string, contact: string): void {
  try {
    window.sessionStorage.setItem(CONTACTS_KEY, JSON.stringify({ ...readContacts(), [normaliseCode(code)]: contact.trim() }));
  } catch {
    // Storage unavailable (private mode): the result just will not survive a refresh.
  }
}

export function forgetContact(code: string): void {
  try {
    const all = readContacts();
    delete all[normaliseCode(code)];
    window.sessionStorage.setItem(CONTACTS_KEY, JSON.stringify(all));
  } catch {
    // Nothing stored.
  }
}

// Calls ------------------------------------------------------------------------------------------

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function parseDecision(v: unknown): ItemDecision | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if ((d.decision !== 'approved' && d.decision !== 'declined') || typeof d.decided_at !== 'string') return null;
  return { decision: d.decision, method: d.method === 'phone' ? 'phone' : 'online', decided_at: d.decided_at };
}

function parseTracked(data: unknown): TrackedRepair | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const r = d.repair as RepairSummary | undefined;
  if (!r || typeof r.id !== 'string') return null;
  return {
    repair: {
      ...r,
      vehicle: r.vehicle && typeof r.vehicle === 'object' ? r.vehicle : {},
      labour_rate: Number(r.labour_rate) || 0,
      linked_to_account: r.linked_to_account === true,
      technician: r.technician ?? null,
    },
    items: arr<RepairItem>(d.items).map((i) => ({ ...i, quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0, decision: parseDecision(i.decision) })),
    events: arr<RepairEvent>(d.events),
    media: arr<RepairMedia>(d.media),
    messages: arr<RepairMessage>(d.messages),
  };
}

function toResult(data: unknown, error: { message: string } | null): Result<TrackedRepair> {
  if (error) return { data: null, error: friendlyError(error.message) };
  const parsed = parseTracked(data);
  return parsed ? { data: parsed, error: null } : { data: null, error: NOT_FOUND_MESSAGE };
}

export async function trackRepair(slug: string, code: string, contact: string): Promise<Result<TrackedRepair>> {
  const { data, error } = await supabase.rpc('track_repair', { p_slug: slug, p_code: normaliseCode(code), p_contact: contact.trim() });
  return toResult(data, error);
}

/**
 * Approving or declining needs a signed-in customer (migration 018). The
 * server checks the account against the repair and records the decision.
 */
export async function respondToItems(slug: string, code: string, contact: string, itemIds: string[], decision: Decision): Promise<Result<TrackedRepair>> {
  const { data, error } = await supabase.rpc('respond_to_repair_items', {
    p_slug: slug,
    p_code: normaliseCode(code),
    p_contact: contact.trim(),
    p_item_ids: itemIds,
    p_decision: decision,
  });
  return toResult(data, error);
}

export async function postMessage(slug: string, code: string, contact: string, body: string): Promise<Result<TrackedRepair>> {
  const { data, error } = await supabase.rpc('post_repair_message', {
    p_slug: slug,
    p_code: normaliseCode(code),
    p_contact: contact.trim(),
    p_body: body,
  });
  return toResult(data, error);
}

/** The signed-in customer's repairs at this workshop, newest first (RLS returns only their own). */
export async function listMyRepairs(customerId: string, workshopId: string): Promise<Result<MyRepair[]>> {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('id, number, tracking_code, status, vehicle, created_at, updated_at, promised_at')
    .eq('customer_id', customerId)
    .eq('workshop_id', workshopId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return { data: null, error: friendlyError(error.message) };
  return {
    data: ((data ?? []) as MyRepair[]).map((r) => ({ ...r, vehicle: r.vehicle && typeof r.vehicle === 'object' ? r.vehicle : {} })),
    error: null,
  };
}

// Hook ---------------------------------------------------------------------------------------------

const POLL_MS = 20_000;
/** With a live subscription, polling only backs it up. */
const POLL_SUBSCRIBED_MS = 60_000;

/** Last result per tracking code (never the contact), so a page opened after a lookup draws at once. */
const lastResult = new Map<string, TrackedRepair>();

/** Store a result the caller already has (after a lookup), so the hook starts from it. */
export function primeTrackedRepair(data: TrackedRepair): void {
  lastResult.set(normaliseCode(data.repair.tracking_code), data);
}

export interface TrackedRepairState {
  data: TrackedRepair | null;
  /** True while the first load runs (no data yet). */
  loading: boolean;
  /** Set when there is no data to show (wrong details, or the first load failed). */
  error: string | null;
  /** Set when a background refresh failed while older data is still shown. */
  stale: boolean;
  /** Loads again now. */
  refresh: () => Promise<void>;
  /** Replaces the data with a fresher copy (the result of an approval or a message). */
  replace: (data: TrackedRepair) => void;
}

/**
 * A repair by tracking code and contact. Pass null for either while it is not
 * known. Polls every 20 seconds while the page is visible; for a signed-in
 * owner it also listens to Realtime changes of the repair and its messages
 * (RLS hides the rows from anyone else, so guests just poll).
 */
export function useTrackedRepair(code: string | null, contact: string | null): TrackedRepairState {
  const { slug } = useSite();
  const key = code && contact ? normaliseCode(code) : null;
  const [data, setData] = useState<TrackedRepair | null>(() => (key ? (lastResult.get(key) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(key && !lastResult.has(key)));
  const [stale, setStale] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [shownKey, setShownKey] = useState(key);
  const seq = useRef(0);
  const contactRef = useRef(contact);
  contactRef.current = contact;
  const dataRef = useRef(data);
  dataRef.current = data;

  // Another code (or none): start again from what is known for it.
  if (shownKey !== key) {
    setShownKey(key);
    setData(key ? (lastResult.get(key) ?? null) : null);
    setError(null);
    setStale(false);
    setLoading(Boolean(key && !lastResult.has(key)));
  }

  const refresh = useCallback(async () => {
    const c = contactRef.current;
    if (!key || !c) return;
    const mine = ++seq.current;
    const res = await trackRepair(slug, key, c);
    if (mine !== seq.current) return;
    setLoading(false);
    if (res.error !== null) {
      const notFound = /could not find a repair/i.test(res.error);
      if (notFound) {
        lastResult.delete(key);
        setData(null);
        setError(res.error);
        setStale(false);
      } else {
        if (dataRef.current) setStale(true);
        else setError(res.error);
      }
      return;
    }
    lastResult.set(key, res.data);
    setData(res.data);
    setError(null);
    setStale(false);
  }, [key, slug]);

  const replace = useCallback(
    (next: TrackedRepair) => {
      seq.current += 1;
      if (key) lastResult.set(key, next);
      setData(next);
      setError(null);
      setStale(false);
      setLoading(false);
    },
    [key],
  );

  // First load, and again when the contact changes.
  useEffect(() => {
    if (!key || !contact) return;
    void refresh();
  }, [key, contact, refresh]);

  // Polling while the page is visible; an immediate refresh when it becomes visible again.
  useEffect(() => {
    if (!key || !contact) return;
    const every = subscribed ? POLL_SUBSCRIBED_MS : POLL_MS;
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, every);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, contact, subscribed, refresh]);

  // Realtime for signed-in owners. Guests get nothing through (RLS), which is fine: polling covers them.
  const repairId = data?.repair.id ?? null;
  useEffect(() => {
    if (!repairId || !key) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let debounce: number | undefined;
    const onChange = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refresh(), 400);
    };
    void supabase.auth.getSession().then(({ data: s }) => {
      if (cancelled || !s.session) return;
      channel = supabase
        .channel(`repair-${repairId}-${Math.random().toString(36).slice(2, 10)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_orders', filter: `id=eq.${repairId}` }, onChange)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'repair_order_messages', filter: `repair_order_id=eq.${repairId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_order_items', filter: `repair_order_id=eq.${repairId}` }, onChange)
        .subscribe((status) => {
          if (!cancelled) setSubscribed(status === 'SUBSCRIBED');
        });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      setSubscribed(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [repairId, key, refresh]);

  return { data, loading, error, stale, refresh, replace };
}
