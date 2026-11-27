import { useEffect, useId, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Phone, Plus, Send, Trash2 } from 'lucide-react';
import { formatTaxLabel } from '@eurowerken/shared';
import type { PartRow, ServiceRow } from '@eurowerken/shared';
import { errorMessage } from '@/api/appointments';
import { parseNumber } from '@/api/catalogue';
import {
  ITEM_KIND_LABEL,
  addRepairItem,
  deleteRepairItem,
  itemProblem,
  lineTotal,
  moveRepairItem,
  repairTotals,
  requestApproval,
  updateRepairItem,
} from '@/api/repairOrders';
import type { Approval, ItemKind, RepairApproval, RepairItem, RepairOrder } from '@/api/repairOrders';
import { useTaxSettings } from '@/api/taxes';
import { Badge } from '@/components/ui/Badge';
import type { Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/format';
import { ErrorNote, Labeled, inputClass } from '../inventory/PartForm';
import { Confirm, SectionTitle, iconButton } from './common';
import { ApprovalLine } from './RepairApprovals';

const APPROVAL_LABEL: Record<Approval, string> = {
  approved: 'Approved',
  pending: 'Waiting for customer',
  declined: 'Declined',
};
const APPROVAL_TONE: Record<Approval, Tone> = { approved: 'ok', pending: 'warn', declined: 'bad' };

const KINDS: ItemKind[] = ['service', 'part', 'labour', 'fee'];

interface RepairItemsCardProps {
  order: RepairOrder;
  items: RepairItem[];
  services: ServiceRow[];
  parts: PartRow[];
  canEdit: boolean;
  /** True when the page asks to choose items for approval (from "Send for approval"). */
  selecting: boolean;
  onSelectingChange: (v: boolean) => void;
  onItems: (items: RepairItem[]) => void;
  onOrder: (order: RepairOrder) => void;
  announce: (message: string) => void;
  /** The latest recorded decision for each item (migration 018). */
  approvals: Map<string, RepairApproval>;
  tz: string;
  /** Opens the "Record phone approval" dialog (shown only with full access and pending items). */
  onRecordPhone: () => void;
}

/** The estimate: line items with inline quantity and price, approval badges, totals and the approval request. */
export function RepairItemsCard({ order, items, services, parts, canEdit, selecting, onSelectingChange, onItems, onOrder, announce, approvals, tz, onRecordPhone }: RepairItemsCardProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<RepairItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const editable = canEdit && order.status !== 'completed' && order.status !== 'cancelled';
  const tax = useTaxSettings();
  const totals = repairTotals(items, tax.components);

  useEffect(() => {
    if (!selecting) setChosen(new Set());
  }, [selecting]);

  async function run<T>(label: string, work: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      return await work();
    } catch (err) {
      setError(errorMessage(err, 'That did not work. Try again.'));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveField(item: RepairItem, patch: RowPatch) {
    const saved = await run(`save-${item.id}`, () => updateRepairItem(item, patch));
    if (saved) {
      onItems(items.map((x) => (x.id === saved.id ? saved : x)));
      if (patch.taxable !== undefined) {
        if (saved.taxable !== patch.taxable) {
          setError('The tax setting of this line could not be saved. Apply migration 029 (npm run db:migrate).');
          return;
        }
        announce(`${saved.description} is now ${saved.taxable ? 'taxed' : 'tax exempt'}.`);
      } else announce(`${saved.description} saved.`);
    }
  }

  async function move(item: RepairItem, direction: -1 | 1) {
    const next = await run(`move-${item.id}`, () => moveRepairItem(items, item.id, direction));
    if (next) {
      onItems(next);
      announce(`${item.description} moved ${direction < 0 ? 'up' : 'down'}.`);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy('remove');
    setRemoveError(null);
    try {
      await deleteRepairItem(removing.id);
      onItems(items.filter((x) => x.id !== removing.id));
      announce(`${removing.description} removed.`);
      setRemoving(null);
    } catch (err) {
      setRemoveError(errorMessage(err, 'The item could not be removed.'));
    } finally {
      setBusy(null);
    }
  }

  async function sendForApproval() {
    const ids = [...chosen];
    const updated = await run('approval', () => requestApproval(order, ids));
    if (updated) {
      onItems(items.map((x) => (chosen.has(x.id) ? { ...x, approval: 'pending' } : x)));
      onOrder(updated);
      onSelectingChange(false);
      announce(`${ids.length} item${ids.length === 1 ? '' : 's'} sent to the customer for approval.`);
    }
  }

  const selectable = items.filter((x) => x.approval !== 'pending');
  const pendingCount = items.length - selectable.length;

  return (
    <Card className="space-y-4 p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <SectionTitle
          id={`${id}-title`}
          title="Line items"
          subtitle={order.labour_rate > 0 ? `Labour rate ${formatCurrency(order.labour_rate)} per hour` : 'No labour rate set (Settings, Booking)'}
          action={
            editable && !selecting && (selectable.length > 0 || pendingCount > 0) ? (
              <div className="flex flex-wrap gap-2">
                {pendingCount > 0 && (
                  <Button variant="ghost" onClick={onRecordPhone}>
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    Record phone approval
                  </Button>
                )}
                {selectable.length > 0 && (
                  <Button variant="ghost" onClick={() => onSelectingChange(true)}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Ask customer to approve
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />

        {selecting && (
          <div className="space-y-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-fg">
            <p>Choose the items the customer should approve. They show on the tracking page with approve and decline buttons.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void sendForApproval()} disabled={chosen.size === 0 || busy !== null}>
                {busy === 'approval' ? 'Sending...' : chosen.size > 0 ? `Send ${chosen.size} for approval` : 'Send for approval'}
              </Button>
              <Button variant="ghost" onClick={() => onSelectingChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <ErrorNote errors={error} />

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-fg2">
            No line items yet.{editable && ' Add a service, part, labour or a fee below.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <div aria-hidden className="hidden border-b border-line bg-surface2/50 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-fg3 lg:grid lg:grid-cols-[minmax(0,1fr)_5.5rem_7rem_6rem_auto] lg:gap-3">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span className="text-right">Total</span>
              <span className="w-[4.5rem]" />
            </div>
            <ul className="divide-y divide-line">
              {items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  record={item.approval === 'pending' ? undefined : approvals.get(item.id)}
                  tz={tz}
                  first={index === 0}
                  last={index === items.length - 1}
                  editable={editable}
                  busy={busy}
                  selecting={selecting && item.approval !== 'pending'}
                  chosen={chosen.has(item.id)}
                  onChoose={(v) =>
                    setChosen((s) => {
                      const next = new Set(s);
                      if (v) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                  onSave={(patch) => void saveField(item, patch)}
                  onMove={(d) => void move(item, d)}
                  onRemove={() => {
                    setRemoveError(null);
                    setRemoving(item);
                  }}
                />
              ))}
            </ul>
          </div>
        )}

        <dl className="ml-auto max-w-xs space-y-1.5 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-fg2">Approved subtotal</dt>
            <dd className="font-medium tabular-nums text-fg">{formatCurrency(totals.subtotal)}</dd>
          </div>
          {totals.taxable !== totals.subtotal && (
            <div className="flex justify-between gap-4">
              <dt className="text-fg3">Taxable</dt>
              <dd className="tabular-nums text-fg3">{formatCurrency(totals.taxable)}</dd>
            </div>
          )}
          {totals.taxes.map((t) => (
            <div key={t.code} className="flex justify-between gap-4">
              <dt className="text-fg2">{formatTaxLabel(t)}</dt>
              <dd className="tabular-nums text-fg">{formatCurrency(t.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-line pt-1.5">
            <dt className="font-semibold text-fg">Total</dt>
            <dd className="font-semibold tabular-nums text-fg">{formatCurrency(totals.total)}</dd>
          </div>
          {totals.pending > 0 && (
            <div className="flex justify-between gap-4 text-warn">
              <dt>Waiting for customer (not included)</dt>
              <dd className="tabular-nums">{formatCurrency(totals.pending)}</dd>
            </div>
          )}
        </dl>
        {tax.error && (
          <p className="ml-auto max-w-xs text-right text-[11px] text-warn" role="status">
            The shop's taxes could not be loaded, so GST 5% is shown. {tax.error}
          </p>
        )}

        {editable && <AddItemForm order={order} items={items} services={services} parts={parts} onAdded={(item) => {
          onItems([...items, item]);
          announce(`${item.description} added.`);
        }} />}
      </section>

      <Confirm
        open={removing !== null}
        title="Remove line item"
        message={<p>Remove {removing?.description} from {order.number}? This cannot be undone.</p>}
        confirmLabel="Remove"
        busyLabel="Removing..."
        busy={busy === 'remove'}
        error={removeError}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

type RowPatch = { quantity?: number; unit_price?: number; taxable?: boolean };

interface ItemRowProps {
  item: RepairItem;
  /** The recorded decision behind the item's current approval, if any. */
  record?: RepairApproval;
  tz: string;
  first: boolean;
  last: boolean;
  editable: boolean;
  busy: string | null;
  selecting: boolean;
  chosen: boolean;
  onChoose: (v: boolean) => void;
  onSave: (patch: RowPatch) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function ItemRow({ item, record, tz, first, last, editable, busy, selecting, chosen, onChoose, onSave, onMove, onRemove }: ItemRowProps) {
  const id = useId();
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(item.unit_price.toFixed(2));

  useEffect(() => setQty(String(item.quantity)), [item.quantity]);
  useEffect(() => setPrice(item.unit_price.toFixed(2)), [item.unit_price]);

  function commit() {
    const q = parseNumber(qty);
    const p = parseNumber(price);
    const patch: { quantity?: number; unit_price?: number } = {};
    if (q !== null && q !== item.quantity) patch.quantity = q;
    if (p !== null && Math.abs(p - item.unit_price) > 0.0001) patch.unit_price = p;
    if (q === null) setQty(String(item.quantity));
    if (p === null) setPrice(item.unit_price.toFixed(2));
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  const small = 'w-full rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs tabular-nums text-fg outline-none focus:border-accent coarse:min-h-11';

  return (
    <li className={`grid gap-2 px-3 py-3 text-xs lg:grid-cols-[minmax(0,1fr)_5.5rem_7rem_6rem_auto] lg:items-center lg:gap-3 ${item.approval === 'declined' ? 'opacity-70' : ''}`}>
      <div className="flex min-w-0 items-start gap-2">
        {selecting && (
          <input
            id={`${id}-choose`}
            type="checkbox"
            checked={chosen}
            onChange={(e) => onChoose(e.target.checked)}
            aria-label={`Ask the customer to approve ${item.description}`}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-6 coarse:w-6"
          />
        )}
        <div className="min-w-0">
          <p className={`break-words font-medium text-fg ${item.approval === 'declined' ? 'line-through' : ''}`}>{item.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-fg3">{ITEM_KIND_LABEL[item.kind]}</span>
            <Badge tone={APPROVAL_TONE[item.approval]}>{APPROVAL_LABEL[item.approval]}</Badge>
            {editable ? (
              <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-fg2 coarse:min-h-11">
                <input
                  type="checkbox"
                  checked={item.taxable}
                  disabled={busy !== null}
                  onChange={(e) => onSave({ taxable: e.target.checked })}
                  aria-label={`Charge tax on ${item.description}`}
                  className="h-3.5 w-3.5 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
                />
                Taxable
              </label>
            ) : (
              !item.taxable && <Badge tone="neutral">Tax exempt</Badge>
            )}
          </div>
          {record && record.decision === item.approval && <ApprovalLine record={record} tz={tz} />}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 lg:contents">
        {editable ? (
          <>
            <div className="w-20 lg:w-auto">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-fg3 lg:hidden" aria-hidden>
                {item.kind === 'labour' ? 'Hours' : 'Qty'}
              </span>
              <input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onBlur={commit}
                onKeyDown={onKey}
                aria-label={`${item.kind === 'labour' ? 'Hours' : 'Quantity'} for ${item.description}`}
                className={small}
              />
            </div>
            <div className="w-28 lg:w-auto">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-fg3 lg:hidden" aria-hidden>
                Unit price
              </span>
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={commit}
                onKeyDown={onKey}
                aria-label={`Unit price for ${item.description}`}
                className={small}
              />
            </div>
          </>
        ) : (
          <>
            <p className="tabular-nums text-fg2">
              <span className="text-fg3 lg:hidden">Qty </span>
              {item.quantity}
            </p>
            <p className="tabular-nums text-fg2">
              <span className="text-fg3 lg:hidden">at </span>
              {formatCurrency(item.unit_price)}
            </p>
          </>
        )}
        <p className="ml-auto self-center font-semibold tabular-nums text-fg lg:ml-0 lg:text-right">{formatCurrency(lineTotal(item))}</p>
        <div className={`flex items-center justify-end ${editable ? 'w-full lg:w-[4.5rem]' : 'lg:w-[4.5rem]'}`}>
          {editable && (
            <>
              <button type="button" className={iconButton} disabled={first || busy !== null} onClick={() => onMove(-1)} aria-label={`Move ${item.description} up`}>
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" className={iconButton} disabled={last || busy !== null} onClick={() => onMove(1)} aria-label={`Move ${item.description} down`}>
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" className={`${iconButton} hover:text-bad`} disabled={busy !== null} onClick={onRemove} aria-label={`Remove ${item.description}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

interface AddItemFormProps {
  order: RepairOrder;
  items: RepairItem[];
  services: ServiceRow[];
  parts: PartRow[];
  onAdded: (item: RepairItem) => void;
}

function AddItemForm({ order, items, services, parts, onAdded }: AddItemFormProps) {
  const id = useId();
  const [kind, setKind] = useState<ItemKind>('service');
  const [pick, setPick] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeServices = services.filter((s) => s.active);

  function reset(next: ItemKind) {
    setKind(next);
    setPick('');
    setError(null);
    if (next === 'labour') {
      setDescription('Labour');
      setQuantity('1');
      setPrice(order.labour_rate > 0 ? order.labour_rate.toFixed(2) : '');
    } else {
      setDescription('');
      setQuantity('1');
      setPrice('');
    }
  }

  function choose(value: string) {
    setPick(value);
    if (kind === 'service') {
      const s = services.find((x) => x.id === value);
      if (s) {
        setDescription(s.name);
        setPrice(s.price_from.toFixed(2));
      }
    } else if (kind === 'part') {
      const p = parts.find((x) => x.id === value);
      if (p) {
        setDescription([p.brand, p.name, p.part_number ? `(${p.part_number})` : null].filter(Boolean).join(' '));
        setPrice(p.price.toFixed(2));
      }
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = parseNumber(quantity);
    const p = parseNumber(price || '0');
    if ((kind === 'service' || kind === 'part') && !pick && !description.trim()) {
      setError(`Choose a ${kind} or type a description.`);
      return;
    }
    const input = {
      kind,
      description,
      quantity: q ?? NaN,
      unit_price: p ?? NaN,
      service_id: kind === 'service' && pick ? pick : null,
      part_id: kind === 'part' && pick ? pick : null,
    };
    const problem = itemProblem(input);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const item = await addRepairItem(order, items, input);
      onAdded(item);
      reset(kind);
    } catch (err) {
      setError(errorMessage(err, 'The item could not be added.'));
    } finally {
      setSaving(false);
    }
  }

  const qtyNumber = parseNumber(quantity);
  const priceNumber = parseNumber(price || '0');
  const preview = qtyNumber !== null && priceNumber !== null ? formatCurrency(Math.round(qtyNumber * priceNumber * 100) / 100) : null;

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-lg border border-line bg-surface2/40 p-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-[10px] font-medium uppercase tracking-wider text-fg3">
        Add an item
      </h3>
      <div role="group" aria-label="Item type" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => reset(k)}
            className={`rounded-lg px-3 py-1.5 text-xs transition coarse:min-h-11 coarse:px-4 ${
              kind === k ? 'bg-accent font-semibold text-white' : 'border border-line bg-surface/70 text-fg2 hover:text-fg'
            }`}
          >
            {ITEM_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kind === 'service' && (
          <Labeled id={`${id}-pick`} label="Service">
            <select id={`${id}-pick`} value={pick} onChange={(e) => choose(e.target.value)} className={inputClass}>
              <option value="">Choose a service</option>
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatCurrency(s.price_from)})
                </option>
              ))}
            </select>
          </Labeled>
        )}
        {kind === 'part' && (
          <Labeled id={`${id}-pick`} label="Part">
            <select id={`${id}-pick`} value={pick} onChange={(e) => choose(e.target.value)} className={inputClass}>
              <option value="">Choose a part</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` [${p.sku}]` : ''} ({formatCurrency(p.price)}, {p.stock} in stock)
                </option>
              ))}
            </select>
          </Labeled>
        )}
        <Labeled id={`${id}-desc`} label="Description">
          <input id={`${id}-desc`} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder={kind === 'fee' ? 'For example: Shop supplies' : ''} />
        </Labeled>
        {kind !== 'fee' && (
          <Labeled id={`${id}-qty`} label={kind === 'labour' ? 'Hours' : 'Quantity'}>
            <input id={`${id}-qty`} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </Labeled>
        )}
        <Labeled
          id={`${id}-price`}
          label={kind === 'labour' ? 'Rate per hour' : kind === 'fee' ? 'Amount' : 'Unit price'}
          hint={kind === 'labour' && order.labour_rate > 0 ? `The repair order's rate is ${formatCurrency(order.labour_rate)}.` : undefined}
        >
          <input id={`${id}-price`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="0.00" />
        </Labeled>
      </div>

      <ErrorNote errors={error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-fg2">{preview ? `Line total ${preview}` : ''}</p>
        <Button type="submit" disabled={saving}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {saving ? 'Adding...' : `Add ${ITEM_KIND_LABEL[kind].toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
