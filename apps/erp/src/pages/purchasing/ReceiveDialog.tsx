import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { parseNumber } from '@/api/catalogue';
import { formatQty, receivePoLines, remaining, twoDecimals } from '@/api/purchaseOrders';
import type { PoLine, PurchaseOrder, ReceiveLine } from '@/api/purchaseOrders';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { Dialog, ErrorNote, inputClass } from '../inventory/PartForm';

interface Props {
  open: boolean;
  order: PurchaseOrder;
  lines: PoLine[];
  onClose: () => void;
  onReceived: (order: PurchaseOrder) => void;
}

/** Receive some or all of an order. Each line starts at what is still to come; set a line to 0 to skip it. */
export function ReceiveDialog(props: Props) {
  if (!props.open) return null;
  return <ReceiveForm {...props} />;
}

interface Row {
  qty: string;
  cost: string;
}

function ReceiveForm({ order, lines, onClose, onReceived }: Props) {
  const id = useId();
  const open = lines.filter((l) => remaining(l) > 0);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(open.map((l) => [l.id, { qty: formatQty(remaining(l)), cost: String(l.unit_cost) }])),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const set = (lineId: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [lineId]: { ...r[lineId], ...patch } }));
  const all = (full: boolean) => setRows(Object.fromEntries(open.map((l) => [l.id, { ...rows[l.id], qty: full ? formatQty(remaining(l)) : '0' }])));

  function check(): ReceiveLine[] | null {
    const problems: string[] = [];
    const out: ReceiveLine[] = [];
    for (const l of open) {
      const r = rows[l.id];
      const q = parseNumber(r.qty) ?? 0;
      const c = parseNumber(r.cost);
      const left = remaining(l);
      if (Number.isNaN(q) || q < 0) problems.push(`${l.description}: enter a quantity of 0 or more.`);
      else if (q > left + 1e-9) problems.push(`${l.description}: only ${formatQty(left)} left to receive.`);
      else if (!twoDecimals(q)) problems.push(`${l.description}: use at most two decimals.`);
      else if (l.part_id && !Number.isInteger(q)) problems.push(`${l.description}: stock is counted in whole units.`);
      if (c === null || Number.isNaN(c) || c < 0 || !twoDecimals(c)) problems.push(`${l.description}: the unit cost must be 0 or more, with at most two decimals.`);
      if (!Number.isNaN(q) && q > 0 && c !== null && !Number.isNaN(c)) {
        out.push(c === l.unit_cost ? { line_id: l.id, qty: q } : { line_id: l.id, qty: q, unit_cost: c });
      }
    }
    if (problems.length === 0 && out.length === 0) problems.push('Enter a quantity to receive for at least one line.');
    setErrors(problems);
    return problems.length ? null : out;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = check();
    if (!list) return;
    setBusy(true);
    try {
      const po = await receivePoLines(order.id, list);
      onReceived(po);
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'The parts could not be received.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={`Receive ${order.number}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={busy || open.length === 0}>
            {busy ? 'Receiving...' : 'Receive into stock'}
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <p className="text-xs text-fg2">
          Enter what arrived. Lines linked to an inventory part add to its stock, and a changed cost becomes the part&apos;s latest unit cost.
          You can receive the rest later.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => all(true)}>
            Everything arrived
          </Button>
          <Button variant="ghost" size="sm" onClick={() => all(false)}>
            Clear
          </Button>
        </div>
        {open.length === 0 && <p className="text-xs text-fg2">Everything on this order has been received.</p>}
        <ul className="divide-y divide-line rounded-lg border border-line">
          {open.map((l) => {
            const r = rows[l.id];
            const q = parseNumber(r.qty) ?? 0;
            const c = parseNumber(r.cost) ?? 0;
            return (
              <li key={l.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_7rem_8rem] sm:items-end">
                <div className="min-w-0 text-xs">
                  <div className="break-words font-medium text-fg">{l.description}</div>
                  <div className="mt-0.5 text-[11px] text-fg3">
                    {[l.part_number, l.part_id ? 'adds to stock' : 'not an inventory part'].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg2">
                    Ordered {formatQty(l.quantity)} · received {formatQty(l.received_qty)} · <strong className="text-fg">{formatQty(remaining(l))} to come</strong>
                  </div>
                </div>
                <label className="block text-[11px] text-fg2">
                  Received now
                  <input
                    inputMode="decimal"
                    value={r.qty}
                    onChange={(e) => set(l.id, { qty: e.target.value })}
                    className={`${inputClass} mt-1`}
                    aria-label={`Quantity received of ${l.description}`}
                  />
                </label>
                <label className="block text-[11px] text-fg2">
                  Unit cost
                  <input
                    inputMode="decimal"
                    value={r.cost}
                    onChange={(e) => set(l.id, { cost: e.target.value })}
                    className={`${inputClass} mt-1`}
                    aria-label={`Unit cost of ${l.description}`}
                  />
                  {!Number.isNaN(q) && !Number.isNaN(c) && q > 0 && <span className="mt-1 block text-fg3">{formatCurrency(q * c)}</span>}
                </label>
              </li>
            );
          })}
        </ul>
        <ErrorNote errors={errors.length ? errors : null} />
      </form>
    </Dialog>
  );
}
