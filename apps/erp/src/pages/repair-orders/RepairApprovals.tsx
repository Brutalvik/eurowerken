import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Globe, History, Phone } from 'lucide-react';
import { errorMessage } from '@/api/appointments';
import { PHONE_NOTE_MAX, lineTotal, phoneNoteProblem, recordPhoneApproval } from '@/api/repairOrders';
import type { RepairApproval, RepairItem, RepairOrder } from '@/api/repairOrders';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { SectionTitle } from './common';

const formatters = new Map<string, Intl.DateTimeFormat>();

/** "25 Nov 2026, 10:42" in the workshop time zone (falls back to the browser's zone). */
export function formatDecidedAt(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let f = formatters.get(tz);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    try {
      f = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', opts);
    }
    formatters.set(tz, f);
  }
  return f.format(d);
}

/** The one-line summary of a decision: how, by whom, when (and the IP for online decisions). */
export function approvalSummary(r: RepairApproval, tz: string): string {
  const verb = r.decision === 'approved' ? 'Approved' : 'Declined';
  const when = formatDecidedAt(r.decided_at, tz);
  if (r.method === 'phone') return `${verb} by phone · recorded by ${r.recorded_by_name ?? 'staff'} · ${when}`;
  return [
    `${verb} online${r.customer_email ? ` by ${r.customer_email}` : ''}`,
    r.signed_in ? 'signed in' : 'not signed in',
    when,
    r.ip_address ? `IP ${r.ip_address}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A decision shown compactly under an item, with the browser and amounts in an expandable detail. */
export function ApprovalLine({ record, tz }: { record: RepairApproval; tz: string }) {
  const Icon = record.method === 'phone' ? Phone : Globe;
  return (
    <div className={`mt-1.5 text-[11px] ${record.decision === 'approved' ? 'text-fg2' : 'text-bad'}`}>
      <p className="flex min-w-0 items-start gap-1.5" title={record.user_agent ?? undefined}>
        <Icon className="mt-0.5 h-3 w-3 shrink-0 text-fg3" aria-hidden />
        <span className="min-w-0 break-words">
          {approvalSummary(record, tz)}
          {record.note && <span className="italic text-fg"> — '{record.note}'</span>}
        </span>
      </p>
      <details className="ml-[1.125rem] mt-0.5">
        <summary className="inline-flex cursor-pointer select-none items-center rounded text-fg3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent coarse:min-h-9">
          Record details
        </summary>
        <dl className="mt-1 grid gap-x-3 gap-y-0.5 rounded-lg border border-line bg-surface2/50 p-2 text-fg2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-fg3">Amount</dt>
          <dd className="tabular-nums">
            {formatCurrency(record.amount)} ({formatCurrency(record.amount_with_tax)} with GST)
          </dd>
          {record.method === 'online' ? (
            <>
              <dt className="text-fg3">Browser</dt>
              <dd className="break-all">{record.user_agent || 'Not known'}</dd>
              <dt className="text-fg3">IP address</dt>
              <dd className="break-all font-mono">{record.ip_address || 'Not known'}</dd>
            </>
          ) : (
            <>
              <dt className="text-fg3">Customer email</dt>
              <dd className="break-all">{record.customer_email || 'None on the order'}</dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}

interface HistoryProps {
  records: RepairApproval[];
  items: RepairItem[];
  tz: string;
  error: string | null;
}

/** Every recorded decision for the order, newest first, including items deleted since. */
export function ApprovalHistoryCard({ records, items, tz, error }: HistoryProps) {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  const itemIds = new Set(items.map((i) => i.id));
  const newest = [...records].reverse();
  const shown = showAll ? newest : newest.slice(0, 5);

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-3 text-xs">
        <SectionTitle
          id={`${id}-title`}
          title="Approval history"
          subtitle="Every customer decision, as recorded. Records cannot be changed."
        />
        <ErrorNote errors={error} />
        {records.length === 0 ? (
          !error && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-4 text-fg2">
              <History className="h-3.5 w-3.5 shrink-0 text-fg3" aria-hidden />
              No decisions recorded yet.
            </p>
          )
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {shown.map((r) => {
                const removed = !r.item_id || !itemIds.has(r.item_id);
                return (
                  <li key={r.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 break-words font-medium text-fg">
                        {r.item_description}
                        {removed && <span className="ml-1.5 text-[11px] font-normal text-fg3">(item removed)</span>}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-fg2">{formatCurrency(r.amount)}</span>
                        <Badge tone={r.decision === 'approved' ? 'ok' : 'bad'}>{r.decision === 'approved' ? 'Approved' : 'Declined'}</Badge>
                      </div>
                    </div>
                    <ApprovalLine record={r} tz={tz} />
                  </li>
                );
              })}
            </ul>
            {newest.length > 5 && (
              <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'Show fewer' : `Show all ${newest.length}`}
              </Button>
            )}
          </>
        )}
      </section>
    </Card>
  );
}

interface PhoneDialogProps {
  open: boolean;
  order: RepairOrder;
  /** The items still waiting for the customer. */
  pending: RepairItem[];
  /** Shown above the form, for example when "Start repair" sent staff here. */
  intro?: string | null;
  onClose: () => void;
  /** Called after the decision is recorded; the page reloads the order. */
  onDone: (count: number, decision: 'approved' | 'declined') => void;
}

/** Records a decision the customer gave by phone: tick items, approve or decline, and a required note. */
export function PhoneApprovalDialog({ open, order, pending, intro, onClose, onDone }: PhoneDialogProps) {
  const id = useId();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<'approved' | 'declined'>('approved');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(new Set(pending.map((i) => i.id)));
    setDecision('approved');
    setNote('');
    setError(null);
    // Only when the dialog opens: a live update must not undo the staff member's ticks.
  }, [open]);

  // Items answered meanwhile (by the customer online) drop out of the selection.
  const pendingIds = new Set(pending.map((i) => i.id));
  const ticked = [...chosen].filter((x) => pendingIds.has(x));
  const total = pending.filter((i) => chosen.has(i.id)).reduce((s, i) => s + lineTotal(i), 0);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (ticked.length === 0) {
      setError('Tick at least one item.');
      return;
    }
    const problem = phoneNoteProblem(note);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordPhoneApproval(order.id, ticked, decision, note);
      onDone(ticked.length, decision);
    } catch (err) {
      setError(errorMessage(err, 'The phone approval could not be recorded.'));
    } finally {
      setSaving(false);
    }
  }

  const choice = (value: 'approved' | 'declined', label: string) => (
    <button
      type="button"
      aria-pressed={decision === value}
      onClick={() => setDecision(value)}
      className={`rounded-lg px-3 py-1.5 text-xs transition coarse:min-h-11 coarse:px-4 ${
        decision === value
          ? value === 'approved'
            ? 'bg-ok font-semibold text-white'
            : 'bg-bad font-semibold text-white'
          : 'border border-line bg-surface/70 text-fg2 hover:text-fg'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Dialog
      open={open}
      title={`Record phone approval · ${order.number}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || ticked.length === 0}>
            {saving ? 'Recording...' : `Record ${decision === 'approved' ? 'approval' : 'decline'}${ticked.length > 0 ? ` of ${ticked.length}` : ''}`}
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={(e) => void submit(e)} className="space-y-4 text-xs">
        {intro && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-fg">{intro}</p>}
        <p className="text-fg2">
          Use this when {order.contact_name || 'the customer'} gave their answer by phone or in person. It is recorded as a phone decision with
          your name, and cannot be changed afterwards.
        </p>

        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-fg2">Nothing is waiting for the customer any more.</p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-medium text-fg2">Items</legend>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {pending.map((item) => (
                <li key={item.id} className="flex items-start gap-3 bg-surface2/40 px-3 py-2.5">
                  <input
                    id={`${id}-${item.id}`}
                    type="checkbox"
                    checked={chosen.has(item.id)}
                    onChange={(e) =>
                      setChosen((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-6 coarse:w-6"
                  />
                  <label htmlFor={`${id}-${item.id}`} className="flex min-w-0 flex-1 flex-wrap justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-fg">{item.description}</span>
                    <span className="tabular-nums text-fg2">{formatCurrency(lineTotal(item))}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-right text-[11px] text-fg2">
              Ticked: {formatCurrency(Math.round(total * 100) / 100)} before GST
            </p>
          </fieldset>
        )}

        <div role="group" aria-label="Customer's decision" className="space-y-1">
          <p className="text-xs font-medium text-fg2">Customer's decision</p>
          <div className="flex flex-wrap gap-1.5">
            {choice('approved', 'Approved')}
            {choice('declined', 'Declined')}
          </div>
        </div>

        <Labeled id={`${id}-note`} label="Note (required)" hint="Who you spoke to and when, for example: Spoke to Otto at 10:40.">
          <textarea
            id={`${id}-note`}
            rows={3}
            maxLength={PHONE_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who you spoke to and when"
            className={inputClass}
          />
        </Labeled>

        <ErrorNote errors={error} />
      </form>
    </Dialog>
  );
}
