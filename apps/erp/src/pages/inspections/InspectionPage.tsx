import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Camera, Check, CheckCircle2, CloudOff, Eye, EyeOff, Loader2, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { errorMessage, formatDateTime, getTimeZone, vehicleLabel } from '@/api/appointments';
import {
  CONDITION_LABEL,
  STATUS_LABEL,
  addFindingToEstimate,
  completeInspection,
  countItems,
  getInspection,
  hasWearHint,
  isRetryable,
  parseMeasurement,
  reopenInspection,
  saveInspectionItem,
  sendInspection,
  setInspectionMediaVisible,
  subscribeInspections,
  suggestCondition,
  uploadInspectionMedia,
} from '@/api/inspections';
import type { Condition, Inspection, InspectionItem, InspectionMedia, ItemValues } from '@/api/inspections';
import { ITEM_KIND_LABEL, canCancel, deleteRepairMedia, getRepairOrderRow, itemProblem, listRepairItems, mediaUrl, plateOf, requestApproval } from '@/api/repairOrders';
import type { ItemKind, RepairItem, RepairOrder } from '@/api/repairOrders';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { Confirm, iconButton, textLink } from '../repair-orders/common';
import { INSPECTION_STATUS_TONE } from '../repair-orders/InspectionCard';

// Local values and autosave ----------------------------------------------------------------------------

/** What is on screen for one item (the measurement as typed). */
interface Local {
  condition: Condition | null;
  measurementText: string;
  note: string;
}

type SaveState = { kind: 'saved' } | { kind: 'saving' } | { kind: 'waiting' } | { kind: 'error'; message: string; retrying: boolean };

const DRAFT_KEY = (inspectionId: string) => `ew-inspection-drafts:${inspectionId}`;
const DEBOUNCE_MS = 700;
const RETRY_STEPS_MS = [2000, 5000, 10000, 20000, 30000];

function localOf(item: InspectionItem): Local {
  return { condition: item.condition, measurementText: item.measurement === null ? '' : String(item.measurement), note: item.note ?? '' };
}

function readStoredDrafts(inspectionId: string): Record<string, ItemValues> {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY(inspectionId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ItemValues>) : {};
  } catch {
    return {};
  }
}

function storeDrafts(inspectionId: string, drafts: Map<string, ItemValues>) {
  try {
    if (drafts.size === 0) window.localStorage.removeItem(DRAFT_KEY(inspectionId));
    else window.localStorage.setItem(DRAFT_KEY(inspectionId), JSON.stringify(Object.fromEntries(drafts)));
  } catch {
    // Storage full or blocked: the changes are still kept in memory and sent again.
  }
}

/**
 * Saves item changes in the background: each change waits a moment (more taps are combined), then the whole state of
 * the item is sent. Unsent changes stay in memory and in this device's storage and are sent again with growing pauses,
 * when the connection comes back, or when Retry is pressed. Nothing typed is thrown away.
 */
function useAutosave(inspectionId: string, enabled: boolean, onSaved: (item: InspectionItem) => void) {
  const drafts = useRef(new Map<string, ItemValues>());
  const versions = useRef(new Map<string, number>());
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<number | null>(null);
  const attempt = useRef(0);
  const enabledRef = useRef(enabled);
  const onSavedRef = useRef(onSaved);
  const waiters = useRef<((ok: boolean) => void)[]>([]);
  const [state, setState] = useState<SaveState>({ kind: 'saved' });
  const [unsent, setUnsent] = useState(0);

  enabledRef.current = enabled;
  onSavedRef.current = onSaved;

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const settle = useCallback((ok: boolean) => {
    const list = waiters.current;
    waiters.current = [];
    for (const w of list) w(ok);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    if (running.current) {
      again.current = true;
      return;
    }
    if (drafts.current.size === 0) {
      setState({ kind: 'saved' });
      settle(true);
      return;
    }
    if (!enabledRef.current) {
      setState({ kind: 'error', message: 'This inspection is not open for changes. Reopen it to save the changes kept on this device.', retrying: false });
      settle(false);
      return;
    }
    running.current = true;
    setState({ kind: 'saving' });
    let failure: { message: string; retry: boolean } | null = null;
    for (const [id, values] of Array.from(drafts.current.entries())) {
      const v = versions.current.get(id) ?? 0;
      try {
        const saved = await saveInspectionItem(id, values);
        onSavedRef.current(saved);
        if ((versions.current.get(id) ?? 0) === v) drafts.current.delete(id);
      } catch (err) {
        failure = { message: errorMessage(err, 'A change could not be saved.'), retry: isRetryable(err) };
        // No connection: stop and try again later. A refusal: go on with the other items.
        if (failure.retry) break;
      }
    }
    storeDrafts(inspectionId, drafts.current);
    setUnsent(drafts.current.size);
    running.current = false;

    if (failure) {
      const wait = RETRY_STEPS_MS[Math.min(attempt.current, RETRY_STEPS_MS.length - 1)];
      attempt.current += 1;
      setState({ kind: 'error', message: failure.message, retrying: failure.retry });
      if (failure.retry) timer.current = window.setTimeout(() => void flush(), wait);
      settle(false);
      return;
    }
    attempt.current = 0;
    if (again.current || drafts.current.size > 0) {
      again.current = false;
      void flush();
      return;
    }
    setState({ kind: 'saved' });
    settle(true);
  }, [inspectionId, settle]);

  const queue = useCallback(
    (itemId: string, values: ItemValues) => {
      drafts.current.set(itemId, values);
      versions.current.set(itemId, (versions.current.get(itemId) ?? 0) + 1);
      storeDrafts(inspectionId, drafts.current);
      setUnsent(drafts.current.size);
      setState((s) => (s.kind === 'error' ? s : { kind: 'waiting' }));
      clearTimer();
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [inspectionId, flush],
  );

  /** Sends everything now; resolves true when nothing is left unsent. */
  const flushNow = useCallback((): Promise<boolean> => {
    if (drafts.current.size === 0 && !running.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      waiters.current.push(resolve);
      attempt.current = 0;
      void flush();
    });
  }, [flush]);

  /** Restores changes kept on this device (for example after the tab was closed while offline). */
  const restore = useCallback(
    (stored: Record<string, ItemValues>) => {
      for (const [id, values] of Object.entries(stored)) {
        drafts.current.set(id, values);
        versions.current.set(id, (versions.current.get(id) ?? 0) + 1);
      }
      setUnsent(drafts.current.size);
      if (drafts.current.size > 0) void flush();
    },
    [flush],
  );

  const discard = useCallback(() => {
    drafts.current.clear();
    storeDrafts(inspectionId, drafts.current);
    setUnsent(0);
    setState({ kind: 'saved' });
  }, [inspectionId]);

  useEffect(() => {
    const onOnline = () => {
      attempt.current = 0;
      void flush();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (drafts.current.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onLeave);
      clearTimer();
    };
  }, [flush]);

  const has = useCallback((itemId: string) => drafts.current.has(itemId), []);

  return { state, unsent, queue, flushNow, restore, discard, has, retry: () => void flushNow() };
}

// Page -------------------------------------------------------------------------------------------------

type Filter = 'all' | 'todo' | 'findings';

interface Upload {
  done: number;
  total: number;
}

/**
 * One inspection, full screen and made for a tablet or phone in the bay: sections with progress, big Good / Attention /
 * Urgent / N/A choices, measurements with wear hints, notes, photos from the camera, findings to the estimate,
 * then Complete and Send to customer. Every change saves by itself. Route: /repair-orders/:repairOrderId/inspections/:inspectionId
 */
export function InspectionPage() {
  const { repairOrderId = '', inspectionId = '' } = useParams();
  const { can } = useAuth();
  const canEdit = can('repair-orders', 'full');

  const [order, setOrder] = useState<RepairOrder | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [autoSet, setAutoSet] = useState<Record<string, boolean>>({});
  const [media, setMedia] = useState<InspectionMedia[]>([]);
  const [lines, setLines] = useState<RepairItem[]>([]);
  const [tz, setTz] = useState('America/Edmonton');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string[]>>({});
  const [estimateFor, setEstimateFor] = useState<InspectionItem | null>(null);
  const [finish, setFinish] = useState<'complete' | 'send' | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InspectionMedia | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [heldDrafts, setHeldDrafts] = useState(0);
  const [live, setLive] = useState('');
  const restored = useRef(false);

  const editable = canEdit && inspection?.status === 'in_progress';

  const announce = useCallback((message: string) => {
    setLive('');
    window.setTimeout(() => setLive(message), 30);
  }, []);

  const onSaved = useCallback((saved: InspectionItem) => {
    setItems((list) => list.map((x) => (x.id === saved.id ? saved : x)));
  }, []);
  const autosave = useAutosave(inspectionId, editable, onSaved);
  const { has: hasDraft, restore } = autosave;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [o, d] = await Promise.all([getRepairOrderRow(repairOrderId), getInspection(inspectionId)]);
      setOrder(o);
      if (!d || !o || d.inspection.repair_order_id !== o.id) {
        setInspection(null);
        return;
      }
      setInspection(d.inspection);
      setItems(d.items);
      setMedia(d.media);
      // Items with unsent changes keep what is on screen.
      setLocal((prev) => {
        const next: Record<string, Local> = {};
        for (const it of d.items) next[it.id] = hasDraft(it.id) && prev[it.id] ? prev[it.id] : localOf(it);
        return next;
      });
      void listRepairItems(o.id).then(setLines).catch(() => undefined);
      void getTimeZone(o.workshop_id).then(setTz).catch(() => undefined);
    } catch (err) {
      setLoadError(errorMessage(err, 'The inspection could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [repairOrderId, inspectionId, hasDraft]);

  useEffect(() => {
    restored.current = false;
    setLoading(true);
    void load();
  }, [load]);

  // Changes kept on this device from an earlier visit: shown again and sent (only while the inspection is open).
  useEffect(() => {
    if (!inspection || restored.current) return;
    const stored = readStoredDrafts(inspection.id);
    const ids = Object.keys(stored).filter((id) => items.some((i) => i.id === id));
    if (ids.length === 0) {
      restored.current = true;
      return;
    }
    if (inspection.status !== 'in_progress' || !canEdit) {
      setHeldDrafts(ids.length);
      return;
    }
    restored.current = true;
    setHeldDrafts(0);
    const keep: Record<string, ItemValues> = {};
    for (const id of ids) keep[id] = stored[id];
    setLocal((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const v = keep[id];
        next[id] = { condition: v.condition, measurementText: v.measurement === null ? '' : String(v.measurement), note: v.note };
      }
      return next;
    });
    restore(keep);
    announce(`${ids.length} change${ids.length === 1 ? '' : 's'} kept on this device ${ids.length === 1 ? 'is' : 'are'} being saved.`);
  }, [inspection, items, canEdit, restore, announce]);

  useEffect(() => {
    if (!repairOrderId) return;
    const off = subscribeInspections(repairOrderId, () => void load());
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [repairOrderId, load]);

  const sections = useMemo(() => {
    const out: { name: string; items: InspectionItem[] }[] = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (last && last.name === it.section) last.items.push(it);
      else {
        const existing = out.find((s) => s.name === it.section);
        if (existing) existing.items.push(it);
        else out.push({ name: it.section, items: [it] });
      }
    }
    return out;
  }, [items]);

  const shownCondition = useCallback((it: InspectionItem): Condition | null => (local[it.id] ? local[it.id].condition : it.condition), [local]);
  const counts = useMemo(() => countItems(items.map((it) => ({ condition: shownCondition(it) }))), [items, shownCondition]);
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  // Changing an item ------------------------------------------------------------------------------------

  const localRef = useRef(local);
  localRef.current = local;
  const autoRef = useRef(autoSet);
  autoRef.current = autoSet;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const { queue } = autosave;

  const change = useCallback(
    (item: InspectionItem, patch: Partial<Local>, opts: { auto?: boolean } = {}) => {
      if (!editableRef.current) return;
      const cur = localRef.current[item.id] ?? localOf(item);
      const next: Local = { ...cur, ...patch };
      if (patch.measurementText !== undefined) {
        const parsed = parseMeasurement(next.measurementText);
        setInvalid((m) => ({ ...m, [item.id]: parsed === 'invalid' }));
        // A measurement on a tread or pad item sets the condition, unless the technician chose one.
        const suggested = parsed === 'invalid' ? null : suggestCondition(item, parsed);
        if (suggested && (cur.condition === null || autoRef.current[item.id])) {
          next.condition = suggested;
          autoRef.current = { ...autoRef.current, [item.id]: true };
          setAutoSet(autoRef.current);
        }
      } else if (patch.condition !== undefined && !opts.auto) {
        autoRef.current = { ...autoRef.current, [item.id]: false };
        setAutoSet(autoRef.current);
      }
      // Kept in the ref at once, so quick taps before the next render build on each other.
      localRef.current = { ...localRef.current, [item.id]: next };
      setLocal(localRef.current);
      // While the measurement box holds something that is not a number, the last saved measurement is kept.
      const m = parseMeasurement(next.measurementText);
      queue(item.id, { condition: next.condition, measurement: m === 'invalid' ? item.measurement : m, note: next.note });
    },
    [queue],
  );

  async function onFiles(item: InspectionItem, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!order || files.length === 0) return;
    const problems: string[] = [];
    let added = 0;
    for (let i = 0; i < files.length; i += 1) {
      setUploads((u) => ({ ...u, [item.id]: { done: i, total: files.length } }));
      try {
        const m = await uploadInspectionMedia(order, item.id, files[i]);
        setMedia((list) => [...list, m]);
        added += 1;
      } catch (err) {
        problems.push(errorMessage(err, `${files[i].name} could not be uploaded.`));
      }
    }
    setUploads((u) => {
      const next = { ...u };
      delete next[item.id];
      return next;
    });
    setItemErrors((m) => ({ ...m, [item.id]: problems }));
    if (added > 0) announce(`${added} ${added === 1 ? 'file' : 'files'} added to ${item.label}.`);
  }

  async function removeMedia() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deleteRepairMedia(removing);
      setMedia((list) => list.filter((x) => x.id !== removing.id));
      announce(`${removing.kind === 'video' ? 'Video' : 'Photo'} deleted.`);
      setRemoving(null);
    } catch (err) {
      setRemoveError(errorMessage(err, 'It could not be deleted.'));
    } finally {
      setRemoveBusy(false);
    }
  }

  async function toggleVisible(m: InspectionMedia) {
    try {
      const saved = await setInspectionMediaVisible(m.id, !m.visible_to_customer);
      setMedia((list) => list.map((x) => (x.id === saved.id ? saved : x)));
      announce(saved.visible_to_customer ? 'The customer can see it now.' : 'Hidden from the customer.');
    } catch (err) {
      setItemErrors((e) => ({ ...e, [m.inspection_item_id ?? '']: [errorMessage(err, 'That could not be saved.')] }));
    }
  }

  async function reopen() {
    if (!inspection) return;
    setReopenBusy(true);
    setReopenError(null);
    try {
      const i = await reopenInspection(inspection.id);
      setInspection(i);
      setReopening(false);
      restored.current = false;
      announce('Inspection reopened. Changes save again.');
    } catch (err) {
      setReopenError(errorMessage(err, 'The inspection could not be reopened.'));
    } finally {
      setReopenBusy(false);
    }
  }

  // Rendering ---------------------------------------------------------------------------------------------

  if (loading && !inspection) {
    return (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading inspection...
      </p>
    );
  }

  const backTo = `/repair-orders/${repairOrderId}`;

  if (!inspection || !order) {
    return (
      <Card className="space-y-3 p-6 text-center text-xs text-fg2">
        {loadError ? <ErrorNote errors={loadError} /> : <p>This inspection was not found, or your role cannot see it.</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {loadError && (
            <Button variant="ghost" onClick={() => void load()}>
              Retry
            </Button>
          )}
          <Link to={backTo} className={`${textLink} justify-center`}>
            Back to the repair order
          </Link>
        </div>
      </Card>
    );
  }

  const visibleItems = (list: InspectionItem[]) =>
    list.filter((it) => {
      const c = shownCondition(it);
      if (filter === 'todo') return c === null;
      if (filter === 'findings') return c === 'attention' || c === 'urgent';
      return true;
    });
  const pct = counts.total ? Math.round((counts.checked / counts.total) * 100) : 0;
  const car = vehicleLabel(order.vehicle);
  const plate = plateOf(order.vehicle);
  const repairOpen = canCancel(order.status);
  const findingLines = items.map((it) => (it.estimate_item_id ? lineById.get(it.estimate_item_id) : undefined)).filter((l): l is RepairItem => !!l);
  const pendingLines = findingLines.filter((l) => l.approval === 'pending');

  return (
    <div className="min-w-0 space-y-4 pb-28">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <Link to={backTo} className={`${textLink} text-xs`}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {order.number}
      </Link>

      {/* Header: what is being inspected, progress and the save state; stays at the top while scrolling. */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 rounded-xl px-1 pb-1 pt-1 backdrop-blur">
        <Card className="space-y-3 p-3 md:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 font-display text-base font-semibold text-fg md:text-lg">
                {inspection.name}
                <Badge tone={INSPECTION_STATUS_TONE[inspection.status]}>{STATUS_LABEL[inspection.status]}</Badge>
              </h1>
              <p className="text-xs text-fg2">
                {order.number} · {car || 'Vehicle not given'}
                {plate ? ` · ${plate.toUpperCase()}` : ''}
              </p>
            </div>
            <SaveIndicator state={autosave.state} unsent={autosave.unsent} editable={editable} onRetry={autosave.retry} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-fg2">
              <span>
                {counts.checked} of {counts.total} checked
              </span>
              <span className="flex flex-wrap gap-1.5">
                {counts.urgent > 0 && <Badge tone="bad">{counts.urgent} urgent</Badge>}
                {counts.attention > 0 && <Badge tone="warn">{counts.attention} attention</Badge>}
                {counts.good > 0 && <Badge tone="ok">{counts.good} good</Badge>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label="Inspection progress" aria-valuemin={0} aria-valuemax={counts.total} aria-valuenow={counts.checked}>
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <nav aria-label="Sections" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {sections.map((s, i) => {
              const done = s.items.filter((it) => shownCondition(it) !== null).length;
              const urgent = s.items.some((it) => shownCondition(it) === 'urgent');
              return (
                <a
                  key={s.name}
                  href={`#section-${i}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.getElementById(`section-${i}-title`)?.focus({ preventScroll: true });
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-10 ${
                    done === s.items.length ? 'border-ok/40 text-ok' : 'border-line text-fg2'
                  }`}
                >
                  {done === s.items.length && <Check className="h-3 w-3" aria-hidden />}
                  {s.name}
                  <span className={urgent ? 'text-bad' : 'text-fg3'}>
                    {done}/{s.items.length}
                  </span>
                </a>
              );
            })}
          </nav>
        </Card>
      </div>

      {heldDrafts > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border border-warn/40 p-3 text-xs text-warn">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            This device has {heldDrafts} unsaved change{heldDrafts === 1 ? '' : 's'} from earlier. Reopen the inspection to save {heldDrafts === 1 ? 'it' : 'them'}, or discard.
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              autosave.discard();
              try {
                window.localStorage.removeItem(`ew-inspection-drafts:${inspection.id}`);
              } catch {
                // Nothing stored.
              }
              setHeldDrafts(0);
              restored.current = true;
            }}
          >
            Discard
          </Button>
        </Card>
      )}

      {inspection.status !== 'in_progress' && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-fg2">
          <p className="min-w-0">
            {inspection.status === 'sent'
              ? `Sent to the customer ${formatDateTime(inspection.sent_at, tz)}. It is read-only.`
              : `Completed ${formatDateTime(inspection.completed_at, tz)}. It is read-only.`}
            {inspection.reopened_at ? ` Last reopened ${formatDateTime(inspection.reopened_at, tz)}.` : ''}
            {inspection.summary ? <span className="mt-1 block whitespace-pre-wrap text-fg">{inspection.summary}</span> : null}
          </p>
          {canEdit && repairOpen && (
            <Button variant="ghost" onClick={() => setReopening(true)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reopen
            </Button>
          )}
        </Card>
      )}

      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', `All (${counts.total})`],
            ['todo', `To do (${counts.total - counts.checked})`],
            ['findings', `Findings (${counts.attention + counts.urgent})`],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-11 ${
              filter === f ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg2 hover:bg-surface2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {sections.map((s, i) => {
        const shown = visibleItems(s.items);
        const done = s.items.filter((it) => shownCondition(it) !== null).length;
        return (
          <section key={s.name} id={`section-${i}`} aria-labelledby={`section-${i}-title`} className="scroll-mt-48 space-y-2">
            <h2 id={`section-${i}-title`} tabIndex={-1} className="flex items-center justify-between gap-2 px-1 font-display text-sm font-semibold text-fg outline-none">
              {s.name}
              <span className="text-[11px] font-normal text-fg3">
                {done} of {s.items.length}
              </span>
            </h2>
            {shown.length === 0 ? (
              <p className="px-1 text-[11px] text-fg3">{filter === 'todo' ? 'All checked.' : 'Nothing here.'}</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    value={local[it.id] ?? localOf(it)}
                    invalid={!!invalid[it.id]}
                    auto={!!autoSet[it.id]}
                    editable={editable}
                    canEstimate={canEdit && repairOpen}
                    line={it.estimate_item_id ? lineById.get(it.estimate_item_id) : undefined}
                    media={media.filter((m) => m.inspection_item_id === it.id)}
                    sent={inspection.status === 'sent'}
                    upload={uploads[it.id]}
                    errors={itemErrors[it.id] ?? []}
                    onChange={change}
                    onFiles={onFiles}
                    onEstimate={setEstimateFor}
                    onRemoveMedia={(m) => {
                      setRemoveError(null);
                      setRemoving(m);
                    }}
                    onToggleVisible={(m) => void toggleVisible(m)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Finish bar */}
      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:left-auto md:right-4 md:bottom-4 md:rounded-xl md:border">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-[11px] text-fg2">
              {findingLines.length > 0 ? `${findingLines.length} finding${findingLines.length === 1 ? '' : 's'} on the estimate` : 'Findings can be added to the estimate.'}
            </p>
            {inspection.status === 'in_progress' && (
              <Button variant="ghost" onClick={() => setFinish('complete')}>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Complete
              </Button>
            )}
            {inspection.status !== 'sent' && order.status !== 'cancelled' && (
              <Button onClick={() => setFinish('send')}>
                <Send className="h-4 w-4" aria-hidden />
                Send to customer
              </Button>
            )}
          </div>
        </div>
      )}

      {!canEdit && <p className="text-[11px] text-fg3">You can view inspections. Changing them needs full Repair Orders access.</p>}

      <EstimateDialog
        item={estimateFor}
        note={estimateFor ? (local[estimateFor.id]?.note ?? estimateFor.note ?? '') : ''}
        beforeAdd={autosave.flushNow}
        onClose={() => setEstimateFor(null)}
        onAdded={(line, item) => {
          setLines((l) => [...l, line]);
          setItems((list) => list.map((x) => (x.id === item.id ? { ...x, estimate_item_id: line.id } : x)));
          setEstimateFor(null);
          announce(`${line.description} added to the estimate, waiting for the customer's approval.`);
        }}
      />

      <FinishDialog
        mode={finish}
        inspection={inspection}
        order={order}
        items={items}
        shownCondition={shownCondition}
        pendingLines={pendingLines}
        beforeFinish={autosave.flushNow}
        onClose={() => setFinish(null)}
        onDone={(i, o, message) => {
          setInspection(i);
          if (o) setOrder(o);
          setFinish(null);
          announce(message);
          void load();
        }}
      />

      <Confirm
        open={reopening}
        title="Reopen inspection"
        message={
          <p>
            Reopen this inspection to change it? Your name is recorded.
            {inspection.status === 'sent' ? ' The customer no longer sees the report until you send it again.' : ''}
          </p>
        }
        confirmLabel="Reopen"
        busyLabel="Reopening..."
        busy={reopenBusy}
        error={reopenError}
        onConfirm={() => void reopen()}
        onCancel={() => setReopening(false)}
      />
      <Confirm
        open={removing !== null}
        title={removing?.kind === 'video' ? 'Delete video' : 'Delete photo'}
        message={<p>Delete this {removing?.kind === 'video' ? 'video' : 'photo'}? The file is removed. This cannot be undone.</p>}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={removeBusy}
        error={removeError}
        onConfirm={() => void removeMedia()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

// Save state ----------------------------------------------------------------------------------------------

function SaveIndicator({ state, unsent, editable, onRetry }: { state: SaveState; unsent: number; editable: boolean; onRetry: () => void }) {
  if (!editable && unsent === 0) return null;
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-[11px]">
      {state.kind === 'saved' && (
        <span className="flex items-center gap-1 text-ok">
          <Check className="h-3.5 w-3.5" aria-hidden />
          All changes saved
        </span>
      )}
      {(state.kind === 'saving' || state.kind === 'waiting') && (
        <span className="flex items-center gap-1 text-fg2">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Saving...
        </span>
      )}
      {state.kind === 'error' && (
        <>
          <span className="flex max-w-xs items-start gap-1 text-bad">
            <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {unsent} change{unsent === 1 ? '' : 's'} not saved yet. {state.message}
              {state.retrying ? ' Trying again by itself.' : ''}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Retry now
          </Button>
        </>
      )}
    </div>
  );
}

// One item ------------------------------------------------------------------------------------------------

const CONDITION_STYLE: Record<Condition, { on: string; off: string }> = {
  good: { on: 'border-ok bg-ok text-white', off: 'border-ok/40 text-ok hover:bg-ok/10' },
  attention: { on: 'border-warn bg-warn text-white', off: 'border-warn/40 text-warn hover:bg-warn/10' },
  urgent: { on: 'border-bad bg-bad text-white', off: 'border-bad/40 text-bad hover:bg-bad/10' },
  na: { on: 'border-fg3 bg-fg3 text-white', off: 'border-line text-fg2 hover:bg-surface2' },
};

interface ItemRowProps {
  item: InspectionItem;
  value: Local;
  invalid: boolean;
  auto: boolean;
  editable: boolean;
  canEstimate: boolean;
  line: RepairItem | undefined;
  media: InspectionMedia[];
  sent: boolean;
  upload: Upload | undefined;
  errors: string[];
  onChange: (item: InspectionItem, patch: Partial<Local>, opts?: { auto?: boolean }) => void;
  onFiles: (item: InspectionItem, e: ChangeEvent<HTMLInputElement>) => void;
  onEstimate: (item: InspectionItem) => void;
  onRemoveMedia: (m: InspectionMedia) => void;
  onToggleVisible: (m: InspectionMedia) => void;
}

const ItemRow = memo(function ItemRow({
  item,
  value,
  invalid,
  auto,
  editable,
  canEstimate,
  line,
  media,
  sent,
  upload,
  errors,
  onChange,
  onFiles,
  onEstimate,
  onRemoveMedia,
  onToggleVisible,
}: ItemRowProps) {
  const id = useId();
  const wear = hasWearHint(item);
  const parsed = parseMeasurement(value.measurementText);
  const suggested = parsed === 'invalid' ? null : suggestCondition(item, parsed);
  const finding = value.condition === 'attention' || value.condition === 'urgent';
  const border = value.condition === 'urgent' ? 'border-l-bad' : value.condition === 'attention' ? 'border-l-warn' : value.condition === 'good' ? 'border-l-ok' : 'border-l-transparent';

  return (
    <li id={`item-${item.id}`} className={`glass scroll-mt-48 rounded-xl border-l-4 p-3 md:p-4 ${border}`}>
      <fieldset className="space-y-3" disabled={!editable}>
        <legend className="mb-2 w-full">
          <span className="block text-sm font-semibold text-fg">{item.label}</span>
          {item.help && <span className="mt-0.5 block text-[11px] text-fg3">{item.help}</span>}
        </legend>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['good', 'attention', 'urgent', 'na'] as Condition[]).map((c) => {
            const on = value.condition === c;
            return (
              <label
                key={c}
                className={`flex min-h-12 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg border-2 px-2 text-sm font-semibold transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                  on ? CONDITION_STYLE[c].on : CONDITION_STYLE[c].off
                } ${!editable ? 'cursor-default opacity-80' : ''} ${c === 'na' && !on ? 'font-medium' : ''}`}
              >
                <input type="radio" name={`${id}-condition`} value={c} checked={on} onChange={() => onChange(item, { condition: c })} className="sr-only" />
                {on && <Check className="h-4 w-4" aria-hidden />}
                {CONDITION_LABEL[c]}
              </label>
            );
          })}
        </div>
        {editable && value.condition !== null && (
          <button type="button" onClick={() => onChange(item, { condition: null })} className="text-[11px] text-fg3 underline-offset-2 hover:text-fg hover:underline coarse:min-h-9">
            Clear choice
          </button>
        )}

        {item.kind === 'measurement' && (
          <div className="space-y-1">
            <label htmlFor={`${id}-m`} className="block text-xs font-medium text-fg2">
              Measurement
            </label>
            <div className="flex max-w-xs items-center gap-2">
              <input
                id={`${id}-m`}
                inputMode="decimal"
                autoComplete="off"
                value={value.measurementText}
                onChange={(e) => onChange(item, { measurementText: e.target.value })}
                aria-invalid={invalid || undefined}
                aria-describedby={`${id}-mh`}
                className={`${inputClass} !min-h-12 text-base ${invalid ? '!border-bad' : ''}`}
              />
              {item.unit && <span className="text-sm text-fg2">{item.unit}</span>}
            </div>
            <p id={`${id}-mh`} className={`text-[11px] ${invalid ? 'text-bad' : 'text-fg3'}`}>
              {invalid
                ? 'Enter a number, for example 4 or 3.5. It is saved once it is a number.'
                : wear
                  ? `Good 5 ${item.unit} or more · attention 3 to 4 ${item.unit} · urgent 2 ${item.unit} or less.${auto && value.condition ? ` Set to ${CONDITION_LABEL[value.condition]} from the measurement.` : ''}`
                  : ''}
            </p>
            {editable && suggested && value.condition && suggested !== value.condition && (
              <button type="button" onClick={() => onChange(item, { condition: suggested }, { auto: true })} className="text-[11px] font-medium text-accent hover:underline coarse:min-h-9">
                The measurement suggests {CONDITION_LABEL[suggested]}. Use it
              </button>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor={`${id}-note`} className="block text-xs font-medium text-fg2">
            Note <span className="font-normal text-fg3">(the customer sees it in the report)</span>
          </label>
          <textarea
            id={`${id}-note`}
            rows={finding || value.note ? 2 : 1}
            maxLength={1000}
            value={value.note}
            onChange={(e) => onChange(item, { note: e.target.value })}
            className={`${inputClass} resize-y text-sm`}
          />
        </div>
      </fieldset>

      {/* Photos (outside the fieldset so they stay viewable when read-only). */}
      <div className="mt-3 space-y-2">
        {media.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {media.map((m) => {
              const url = mediaUrl(m.path);
              const label = m.caption || `${item.label} ${m.kind}`;
              return (
                <li key={m.id} className="relative h-20 w-24 overflow-hidden rounded-xl glass-field">
                  {m.kind === 'video' ? (
                    <video src={url} controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={label} />
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                      <img src={url} alt={label} loading="lazy" className="h-full w-full object-cover" />
                    </a>
                  )}
                  {editable && (
                    <button type="button" onClick={() => onRemoveMedia(m)} className={`${iconButton} absolute right-0.5 top-0.5 !h-8 !w-8 bg-surface/80 hover:text-bad`} aria-label={`Delete ${label}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  {sent && canEstimate && (
                    <button
                      type="button"
                      onClick={() => onToggleVisible(m)}
                      className={`${iconButton} absolute bottom-0.5 right-0.5 !h-8 !w-8 bg-surface/80`}
                      aria-label={m.visible_to_customer ? `Hide ${label} from the customer` : `Show ${label} to the customer`}
                      title={m.visible_to_customer ? 'Customer sees this' : 'Hidden from the customer'}
                    >
                      {m.visible_to_customer ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {upload && (
          <p role="status" className="flex items-center gap-1.5 text-[11px] text-fg2">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Uploading {upload.done + 1} of {upload.total}...
          </p>
        )}
        <ErrorNote errors={errors.length ? errors : null} />

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <label
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3.5 text-xs font-semibold text-fg transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:bg-surface2 ${upload ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Camera className="h-4 w-4" aria-hidden />
              Add photo
              <input
                type="file"
                accept="image/*,video/*"
                capture="environment"
                multiple
                disabled={!!upload}
                onChange={(e) => onFiles(item, e)}
                className="sr-only"
                aria-label={`Add photo or video for ${item.label}`}
              />
            </label>
          )}
          {line ? (
            <Badge tone={line.approval === 'approved' ? 'ok' : line.approval === 'declined' ? 'neutral' : 'warn'}>
              On estimate · {line.approval === 'pending' ? 'waiting for approval' : line.approval}
            </Badge>
          ) : (
            canEstimate &&
            finding && (
              <Button variant="ghost" onClick={() => onEstimate(item)} className="!min-h-11">
                <Plus className="h-4 w-4" aria-hidden />
                Add to estimate
              </Button>
            )
          )}
          {editable && media.length === 0 && !upload && finding && <span className="text-[11px] text-fg3">A photo helps the customer decide.</span>}
          {!sent && media.length > 0 && <span className="text-[11px] text-fg3">Photos are shown to the customer when the report is sent.</span>}
        </div>
      </div>
    </li>
  );
});

// Add to estimate -----------------------------------------------------------------------------------------

const KINDS: ItemKind[] = ['labour', 'part', 'service', 'fee'];

function EstimateDialog({
  item,
  note,
  beforeAdd,
  onClose,
  onAdded,
}: {
  item: InspectionItem | null;
  note: string;
  beforeAdd: () => Promise<boolean>;
  onClose: () => void;
  onAdded: (line: RepairItem, item: InspectionItem) => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<ItemKind>('labour');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const text = note.trim() ? `${item.label}: ${note.trim()}` : item.label;
    setDescription(text.slice(0, 300));
    setKind(/pad|rotor|filter|tire|tread|wiper|battery|belt|hose|bulb|light/i.test(item.label) ? 'part' : 'labour');
    setQuantity('1');
    setPrice('');
    setError(null);
  }, [item, note]);

  async function add() {
    if (!item || busy) return;
    const q = Number(quantity.replace(',', '.'));
    const p = price.trim() === '' ? 0 : Number(price.replace(',', '.'));
    const problem = itemProblem({ description, quantity: q, unit_price: p });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The finding must be saved first (the database checks that it is attention or urgent).
      const saved = await beforeAdd();
      if (!saved) throw new Error('The latest changes are not saved yet. Check the connection and try again.');
      const line = await addFindingToEstimate(item.id, { kind, description, quantity: q, unit_price: p });
      onAdded(line, item);
    } catch (err) {
      setError(errorMessage(err, 'The line could not be added.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={item !== null}
      title="Add to estimate"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void add()} disabled={busy}>
            {busy ? 'Adding...' : 'Add line'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <p className="text-[11px] text-fg2">The line waits for the customer&apos;s approval. Send it for approval from the repair order, or when you send this report.</p>
        <Labeled id={`${id}-kind`} label="Kind">
          <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} className={inputClass}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled id={`${id}-d`} label="Description">
          <textarea id={`${id}-d`} rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled id={`${id}-q`} label="Quantity">
            <input id={`${id}-q`} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </Labeled>
          <Labeled id={`${id}-p`} label="Unit price ($)" hint="Leave empty to price it later.">
            <input id={`${id}-p`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </Labeled>
        </div>
        <ErrorNote errors={error} />
        <button type="submit" className="sr-only">
          Add line
        </button>
      </form>
    </Dialog>
  );
}

// Complete and send ---------------------------------------------------------------------------------------

function suggestSummary(items: InspectionItem[], cond: (it: InspectionItem) => Condition | null): string {
  const urgent = items.filter((it) => cond(it) === 'urgent').map((it) => it.label);
  const attention = items.filter((it) => cond(it) === 'attention').map((it) => it.label);
  const parts: string[] = [];
  if (urgent.length) parts.push(`Needs attention now: ${urgent.join(', ')}.`);
  if (attention.length) parts.push(`Keep an eye on: ${attention.join(', ')}.`);
  if (!parts.length) parts.push('Everything we checked is in good condition.');
  return parts.join('\n').slice(0, 2000);
}

function FinishDialog({
  mode,
  inspection,
  order,
  items,
  shownCondition,
  pendingLines,
  beforeFinish,
  onClose,
  onDone,
}: {
  mode: 'complete' | 'send' | null;
  inspection: Inspection;
  order: RepairOrder;
  items: InspectionItem[];
  shownCondition: (it: InspectionItem) => Condition | null;
  pendingLines: RepairItem[];
  beforeFinish: () => Promise<boolean>;
  onClose: () => void;
  onDone: (i: Inspection, o: RepairOrder | null, message: string) => void;
}) {
  const id = useId();
  const [summary, setSummary] = useState('');
  const [askApproval, setAskApproval] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts = countItems(items.map((it) => ({ condition: shownCondition(it) })));
  const unchecked = counts.total - counts.checked;
  const canAsk = mode === 'send' && pendingLines.length > 0 && canCancel(order.status);

  useEffect(() => {
    if (!mode) return;
    setSummary(inspection.summary ?? suggestSummary(items, shownCondition));
    setAskApproval(true);
    setError(null);
    // Only when the dialog opens.
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    if (!mode || busy) return;
    if (summary.trim().length > 2000) {
      setError(`The summary can be at most 2000 characters (now ${summary.trim().length}).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await beforeFinish();
      if (!saved) throw new Error('Some changes are not saved yet. Check the connection, wait for "All changes saved", then try again.');
      if (mode === 'complete') {
        const i = await completeInspection(inspection.id, summary);
        onDone(i, null, 'Inspection completed. It is read-only now.');
        return;
      }
      const i = await sendInspection(inspection.id, summary);
      let o: RepairOrder | null = null;
      let message = 'Report sent. The customer can see it on their repair page.';
      if (canAsk && askApproval) {
        try {
          o = await requestApproval(order, pendingLines.map((l) => l.id));
          message += ` ${pendingLines.length} line${pendingLines.length === 1 ? ' was' : 's were'} sent for approval.`;
        } catch (err) {
          message += ` The approval request did not go through (${errorMessage(err, 'unknown error')}); use Send for approval on the repair order.`;
        }
      }
      onDone(i, o, message);
    } catch (err) {
      setError(errorMessage(err, mode === 'complete' ? 'The inspection could not be completed.' : 'The report could not be sent.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={mode !== null}
      title={mode === 'send' ? 'Send to customer' : 'Complete inspection'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={busy}>
            {busy ? (mode === 'send' ? 'Sending...' : 'Completing...') : mode === 'send' ? 'Send report' : 'Complete'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-fg2">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="bad">{counts.urgent} urgent</Badge>
          <Badge tone="warn">{counts.attention} attention</Badge>
          <Badge tone="ok">{counts.good} good</Badge>
          {counts.na > 0 && <Badge>{counts.na} N/A</Badge>}
        </div>
        {unchecked > 0 && inspection.status === 'in_progress' && (
          <p className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {unchecked} item{unchecked === 1 ? ' is' : 's are'} not checked. {mode === 'send' ? 'The customer sees them as not checked.' : 'You can still complete it.'}
          </p>
        )}
        <Labeled id={`${id}-s`} label="Summary for the customer" hint="Shown at the top of the report.">
          <textarea id={`${id}-s`} rows={4} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} className={inputClass} />
        </Labeled>
        {mode === 'send' && (
          <p>
            The report and its photos become visible on the customer&apos;s repair page{inspection.status === 'in_progress' ? ', and the inspection is completed (read-only)' : ''}.
          </p>
        )}
        {canAsk && (
          <label className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 coarse:min-h-11">
            <input type="checkbox" checked={askApproval} onChange={(e) => setAskApproval(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
            <span>
              Also ask the customer to approve the {pendingLines.length} recommended line{pendingLines.length === 1 ? '' : 's'} now (the repair moves to awaiting approval).
            </span>
          </label>
        )}
        <ErrorNote errors={error} />
      </div>
    </Dialog>
  );
}
