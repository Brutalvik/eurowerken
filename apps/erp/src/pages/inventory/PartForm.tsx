import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import { PART_QUALITIES, slugify } from '@eurowerken/shared';
import type { PartRow } from '@eurowerken/shared';
import {
  discardImages,
  imageUrl,
  newSpec,
  partDraft,
  savePart,
  uploadPublicImage,
  validatePart,
} from '@/api/catalogue';
import type { PartDraft } from '@/api/catalogue';
import { Button } from '@/components/ui/Button';
import { ImageUpload } from '@/components/ui/ImageUpload';

// Shared form and dialog pieces. Used by the Inventory page and the Services
// and Team cards in Settings. They belong in components/ui once that is agreed.

export const inputClass =
  'w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-xs text-fg outline-none placeholder:text-fg3 focus:border-accent coarse:min-h-11';

export function Labeled({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg2">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-fg3">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ errors }: { errors: string[] | string | null }) {
  const list = errors === null ? [] : Array.isArray(errors) ? errors : [errors];
  if (list.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
      {list.length === 1 ? (
        list[0]
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {list.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A labelled checkbox with a short explanation. */
export function CheckRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface2 p-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
      />
      <label htmlFor={id} className="min-w-0">
        <span className="block text-xs font-semibold text-fg">{label}</span>
        {hint && <span className="block text-[11px] text-fg2">{hint}</span>}
      </label>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** alertdialog for confirmations. */
  role?: 'dialog' | 'alertdialog';
  size?: 'sm' | 'lg';
  /** Close when the dim background is clicked (off for forms, to keep typed data). */
  closeOnBackdrop?: boolean;
}

/**
 * Modal dialog: full screen on phones, centred from md. Focus moves in on
 * open, stays inside while open (Tab wraps) and returns on close; Escape closes.
 */
export function Dialog({ open, title, onClose, children, footer, role = 'dialog', size = 'lg', closeOnBackdrop = false }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current;
    const target =
      node?.querySelector<HTMLElement>('[data-autofocus]') ??
      node?.querySelector<HTMLElement>(`[data-dialog-body] ${FOCUSABLE.split(', ').join(', [data-dialog-body] ')}`) ??
      node;
    target?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const width = size === 'sm' ? 'md:max-w-md' : 'md:max-w-3xl';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-sidebar/60 md:items-center md:p-6"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`pt-safe pb-safe flex h-[100dvh] w-full flex-col bg-surface text-fg outline-none md:h-auto md:max-h-[90dvh] md:rounded-xl md:border md:border-line md:shadow-xl ${width}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
          <h2 id={titleId} className="min-w-0 truncate font-display text-sm font-semibold text-fg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg2 hover:bg-surface2 hover:text-fg coarse:h-11 coarse:w-11"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 md:px-5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before something that cannot be undone. Cancel has the focus first. */
export function ConfirmDialog({ open, title, message, confirmLabel, busy = false, error = null, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      role="alertdialog"
      size="sm"
      closeOnBackdrop
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} data-autofocus>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="!bg-bad">
            {busy ? 'Deleting...' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-fg2">
        <div>{message}</div>
        <ErrorNote errors={error} />
      </div>
    </Dialog>
  );
}

// The part form -------------------------------------------------------------------

interface PartFormProps {
  open: boolean;
  workshopId: string;
  /** Null to add a new part. */
  part: PartRow | null;
  unitCost: number | null;
  categories: string[];
  onClose: () => void;
  /** Called after each successful save (the list refreshes); the form closes itself when everything saved. */
  onSaved: (part: PartRow, unitCost: number | null) => void;
}

export function PartForm(props: PartFormProps) {
  // Remount per part so the draft starts fresh.
  if (!props.open) return null;
  return <PartFormDialog key={props.part?.id ?? 'new'} {...props} />;
}

function PartFormDialog({ workshopId, part, unitCost, categories, onClose, onSaved }: PartFormProps) {
  const formId = useId();
  const listId = useId();
  const [draft, setDraft] = useState<PartDraft>(() => partDraft(part, unitCost));
  const [saved, setSaved] = useState<PartRow | null>(part);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof PartDraft>(key: K, value: PartDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function onName(name: string) {
    setDraft((d) => ({ ...d, name, slug: d.slugEdited ? d.slug : slugify(name) }));
  }

  async function cancel() {
    // Drop images uploaded in this session that were never saved to the part.
    await discardImages(draft.image_paths, saved?.image_paths ?? []);
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const checked = validatePart(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const before = saved?.image_paths ?? [];
      const result = await savePart(workshopId, saved?.id ?? null, checked.value.part, checked.value.unitCost);
      setSaved(result.part);
      void discardImages(before, result.part.image_paths);
      onSaved(result.part, result.unitCost);
      if (result.costError) {
        setErrors([`The part was saved, but its unit cost was not: ${result.costError}`]);
      } else {
        onClose();
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'The part could not be saved.']);
    } finally {
      setBusy(false);
    }
  }

  const f = (name: string) => `${formId}-${name}`;

  return (
    <Dialog
      open
      title={saved ? `Edit ${saved.name}` : 'Add part'}
      onClose={() => void cancel()}
      footer={
        <>
          {errors.length > 0 && (
            <div className="max-h-32 w-full overflow-y-auto">
              <ErrorNote errors={errors} />
            </div>
          )}
          <Button variant="ghost" onClick={() => void cancel()}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={busy || uploading}>
            {busy ? 'Saving...' : uploading ? 'Uploading...' : saved ? 'Save part' : 'Add part'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Labeled id={f('name')} label="Name">
            <input id={f('name')} className={inputClass} maxLength={120} required value={draft.name} onChange={(e) => onName(e.target.value)} />
          </Labeled>
          <Labeled id={f('slug')} label="Slug (web address)" hint="Filled in from the name until you change it.">
            <input
              id={f('slug')}
              className={inputClass}
              maxLength={80}
              required
              value={draft.slug}
              onChange={(e) =>
                setDraft((d) => ({ ...d, slugEdited: true, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))
              }
            />
          </Labeled>
          <Labeled id={f('sku')} label="SKU">
            <input id={f('sku')} className={inputClass} maxLength={40} value={draft.sku} onChange={(e) => set('sku', e.target.value)} />
          </Labeled>
          <Labeled id={f('brand')} label="Brand">
            <input id={f('brand')} className={inputClass} maxLength={60} value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
          </Labeled>
          <Labeled id={f('category')} label="Category" hint="Pick one you already use, or type a new one.">
            <input
              id={f('category')}
              className={inputClass}
              list={listId}
              maxLength={60}
              required
              value={draft.category}
              onChange={(e) => set('category', e.target.value)}
            />
            <datalist id={listId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Labeled>
          <Labeled id={f('part-number')} label="Part number">
            <input
              id={f('part-number')}
              className={inputClass}
              maxLength={60}
              value={draft.part_number}
              onChange={(e) => set('part_number', e.target.value)}
            />
          </Labeled>
          <Labeled id={f('quality')} label="Quality">
            <select
              id={f('quality')}
              className={inputClass}
              value={draft.quality}
              onChange={(e) => set('quality', e.target.value as PartDraft['quality'])}
            >
              {PART_QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={f('fitment')} label="Fitment">
            <select
              id={f('fitment')}
              className={inputClass}
              value={draft.fitment}
              onChange={(e) => set('fitment', e.target.value as PartDraft['fitment'])}
            >
              <option value="guaranteed">Guaranteed fit (vehicle specific)</option>
              <option value="universal">Universal</option>
            </select>
          </Labeled>
        </div>

        <div className="space-y-4 border-t border-line pt-4">
          <h3 className="text-xs font-semibold text-fg">Price and stock</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Labeled id={f('price')} label="Price (CAD)">
              <input id={f('price')} className={inputClass} inputMode="decimal" required value={draft.price} onChange={(e) => set('price', e.target.value)} />
            </Labeled>
            <Labeled id={f('compare')} label="Compare-at (CAD)" hint="Optional old price.">
              <input id={f('compare')} className={inputClass} inputMode="decimal" value={draft.compare_at} onChange={(e) => set('compare_at', e.target.value)} />
            </Labeled>
            <Labeled id={f('cost')} label="Unit cost (CAD)" hint="Staff only, never shown on the website.">
              <input id={f('cost')} className={inputClass} inputMode="decimal" value={draft.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} />
            </Labeled>
            <Labeled id={f('stock')} label="In stock">
              <input id={f('stock')} className={inputClass} inputMode="numeric" value={draft.stock} onChange={(e) => set('stock', e.target.value)} />
            </Labeled>
            <Labeled id={f('min')} label="Minimum stock" hint="Shown as low stock below this level.">
              <input id={f('min')} className={inputClass} inputMode="numeric" value={draft.min_stock} onChange={(e) => set('min_stock', e.target.value)} />
            </Labeled>
          </div>
        </div>

        <div className="space-y-4 border-t border-line pt-4">
          <h3 className="text-xs font-semibold text-fg">Shop details</h3>
          <Labeled id={f('summary')} label="Summary" hint="One line under the name in the shop.">
            <input id={f('summary')} className={inputClass} maxLength={200} value={draft.summary} onChange={(e) => set('summary', e.target.value)} />
          </Labeled>
          <Labeled id={f('description')} label="Description">
            <textarea
              id={f('description')}
              rows={4}
              maxLength={4000}
              className={inputClass}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Labeled>
          <div className="grid gap-4 md:grid-cols-2">
            <Labeled id={f('features')} label="Features" hint="One per line.">
              <textarea id={f('features')} rows={4} className={inputClass} value={draft.features} onChange={(e) => set('features', e.target.value)} />
            </Labeled>
            <Labeled id={f('oem')} label="OEM references" hint="One per line.">
              <textarea id={f('oem')} rows={4} className={inputClass} value={draft.oem_refs} onChange={(e) => set('oem_refs', e.target.value)} />
            </Labeled>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-fg2">Specifications</legend>
            {draft.specs.length === 0 && <p className="text-[11px] text-fg3">None yet. Add rows such as Diameter and 330 mm.</p>}
            {draft.specs.map((s, i) => (
              <div key={s.key} className="flex items-start gap-2">
                <input
                  aria-label={`Specification ${i + 1} label`}
                  placeholder="Label"
                  className={`${inputClass} min-w-0 flex-1`}
                  maxLength={60}
                  value={s.label}
                  onChange={(e) => set('specs', draft.specs.map((x) => (x.key === s.key ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  aria-label={`Specification ${i + 1} value`}
                  placeholder="Value"
                  className={`${inputClass} min-w-0 flex-1`}
                  maxLength={120}
                  value={s.value}
                  onChange={(e) => set('specs', draft.specs.map((x) => (x.key === s.key ? { ...x, value: e.target.value } : x)))}
                />
                <button
                  type="button"
                  onClick={() => set('specs', draft.specs.filter((x) => x.key !== s.key))}
                  aria-label={`Remove specification ${i + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-fg2 hover:text-bad coarse:h-11 coarse:w-11"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => set('specs', [...draft.specs, newSpec()])}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add specification
            </Button>
          </fieldset>

          <Labeled id={f('warranty')} label="Warranty">
            <input
              id={f('warranty')}
              className={inputClass}
              maxLength={200}
              placeholder="2 years or 40,000 km"
              value={draft.warranty}
              onChange={(e) => set('warranty', e.target.value)}
            />
          </Labeled>

          <ImageUpload
            label="Photos"
            hint="The first photo is the main one in the shop."
            value={draft.image_paths}
            onChange={(paths) => set('image_paths', paths)}
            upload={(file) => uploadPublicImage(file, 'parts', workshopId)}
            toUrl={imageUrl}
            onBusyChange={setUploading}
          />

          <CheckRow
            id={f('published')}
            label="Published"
            hint="Shown in the parts shop on your website (when the website is published)."
            checked={draft.published}
            onChange={(v) => set('published', v)}
          />
        </div>

      </form>
    </Dialog>
  );
}
