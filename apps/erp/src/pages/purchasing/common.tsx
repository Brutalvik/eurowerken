import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { PO_STATUS_LABEL, PO_STATUS_TONE } from '@/api/purchaseOrders';
import type { PoStatus } from '@/api/purchaseOrders';
import { createSupplier, supplierDraft, updateSupplier, validateSupplier } from '@/api/suppliers';
import type { Supplier, SupplierDraft } from '@/api/suppliers';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CheckRow, Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return <Badge tone={PO_STATUS_TONE[status]}>{PO_STATUS_LABEL[status]}</Badge>;
}

/** "Dec 1, 2026" for a bare date (yyyy-mm-dd), read at noon UTC so it never moves a day. */
export function formatDay(date: string | null, tz: string): string {
  if (!date) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-CA', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Today as yyyy-mm-dd in the shop's time zone (for date inputs). */
export function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const selectClass = `${inputClass} pr-8`;

interface SupplierFormProps {
  open: boolean;
  workshopId: string;
  /** Null to add a new supplier. */
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
  /** Hide the Active switch (adding a supplier inline). */
  simple?: boolean;
}

/** Add or edit a supplier. Closes itself after a successful save. */
export function SupplierForm(props: SupplierFormProps) {
  if (!props.open) return null;
  return <SupplierFormDialog key={props.supplier?.id ?? 'new'} {...props} />;
}

function SupplierFormDialog({ workshopId, supplier, onClose, onSaved, simple = false }: SupplierFormProps) {
  const id = useId();
  const [draft, setDraft] = useState<SupplierDraft>(() => supplierDraft(supplier));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => setErrors([]), [draft]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const checked = validateSupplier(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setBusy(true);
    try {
      const saved = supplier ? await updateSupplier(supplier.id, checked.value) : await createSupplier(workshopId, checked.value);
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'The supplier could not be saved.']);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: Exclude<keyof SupplierDraft, 'active' | 'notes' | 'address'>, label: string, opts: { type?: string; hint?: string; placeholder?: string; autoComplete?: string } = {}) => (
    <Labeled id={`${id}-${key}`} label={label} hint={opts.hint}>
      <input
        id={`${id}-${key}`}
        type={opts.type ?? 'text'}
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={opts.placeholder}
        autoComplete={opts.autoComplete ?? 'off'}
        className={inputClass}
      />
    </Labeled>
  );

  return (
    <Dialog
      open
      title={supplier ? `Edit ${supplier.name}` : 'Add supplier'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={busy}>
            {busy ? 'Saving...' : supplier ? 'Save supplier' : 'Add supplier'}
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        {field('name', 'Name', { placeholder: 'Worldpac Calgary' })}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('contact_name', 'Contact name')}
          {field('account_number', 'Our account number', { hint: 'Printed on the purchase order.' })}
          {field('email', 'Order email', { type: 'email', hint: 'Purchase orders are emailed here.', placeholder: 'orders@supplier.com' })}
          {field('phone', 'Phone', { type: 'tel' })}
        </div>
        {field('website', 'Website')}
        <Labeled id={`${id}-address`} label="Address">
          <textarea id={`${id}-address`} rows={2} value={draft.address} onChange={(e) => set('address', e.target.value)} className={inputClass} />
        </Labeled>
        <Labeled id={`${id}-notes`} label="Notes" hint="For your team only (delivery days, cut-off times).">
          <textarea id={`${id}-notes`} rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} />
        </Labeled>
        {!simple && supplier && (
          <CheckRow
            id={`${id}-active`}
            label="Active"
            hint="Inactive suppliers keep their orders but cannot get new ones."
            checked={draft.active}
            onChange={(v) => set('active', v)}
          />
        )}
        <ErrorNote errors={errors.length ? errors : null} />
      </form>
    </Dialog>
  );
}

/** The PartsTech connection slot: no behaviour until the partner keys exist. */
export function PartsTechCard() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface2/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-sm font-semibold text-fg">PartsTech</h2>
        <Badge tone="neutral">Coming soon</Badge>
      </div>
      <p className="mt-1 text-xs text-fg2">
        Order from PartsTech&apos;s catalogue (connect with your PartsTech partner keys — coming soon).
      </p>
    </div>
  );
}
