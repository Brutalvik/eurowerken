import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowUp, Battery, Disc, Droplet, Filter, Gauge, Plus, ScanLine, Snowflake, Wrench, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SERVICE_CATEGORY_IDS, SERVICE_CATEGORY_LABELS, SERVICE_ICONS } from '@eurowerken/shared';
import type { ServiceIcon, ServiceRow } from '@eurowerken/shared';
import {
  createService,
  deleteService,
  discardImages,
  imageUrl,
  listServices,
  moveRow,
  nextSortOrder,
  serviceDraft,
  updateService,
  uploadPublicImage,
  validateService,
} from '@/api/catalogue';
import type { ServiceDraft } from '@/api/catalogue';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { formatCurrency } from '@/lib/format';
import { CheckRow, ConfirmDialog, Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';

const ICONS: Record<ServiceIcon, { icon: LucideIcon; label: string }> = {
  oil: { icon: Droplet, label: 'Oil' },
  filter: { icon: Filter, label: 'Filter' },
  battery: { icon: Battery, label: 'Battery' },
  scan: { icon: ScanLine, label: 'Diagnostic scan' },
  gauge: { icon: Gauge, label: 'Gauge' },
  brake: { icon: Disc, label: 'Brake' },
  snow: { icon: Snowflake, label: 'Climate' },
  bolt: { icon: Zap, label: 'Electrical' },
  wrench: { icon: Wrench, label: 'Wrench' },
};

/**
 * The workshop's services, shown on its website. Editing needs full Settings
 * access (enforced by RLS); everyone else sees the list read-only.
 */
export function ServicesCard() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ service: ServiceRow | null } | null>(null);
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    setLoading(true);
    setError(null);
    try {
      setServices(await listServices(workshopId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Services could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () =>
      SERVICE_CATEGORY_IDS.map((id) => ({
        id,
        label: SERVICE_CATEGORY_LABELS[id],
        rows: services.filter((s) => s.category === id).sort((a, b) => a.sort_order - b.sort_order),
      })).filter((g) => g.rows.length > 0),
    [services],
  );

  function upsertLocal(row: ServiceRow) {
    setServices((list) => {
      const exists = list.some((s) => s.id === row.id);
      return (exists ? list.map((s) => (s.id === row.id ? row : s)) : [...list, row]).sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  async function toggleActive(s: ServiceRow, active: boolean) {
    setError(null);
    setRowBusy(s.id);
    upsertLocal({ ...s, active });
    try {
      upsertLocal(await updateService(s.id, { active }));
    } catch (err) {
      upsertLocal(s);
      setError(err instanceof Error ? err.message : 'The service could not be changed.');
    } finally {
      setRowBusy(null);
    }
  }

  async function move(s: ServiceRow, direction: -1 | 1) {
    setError(null);
    setRowBusy(s.id);
    try {
      setServices(await moveRow('services', services, s.id, direction, (a, b) => a.category === b.category));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The order could not be saved.');
      await load();
    } finally {
      setRowBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteService(deleting);
      setServices((list) => list.filter((s) => s.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'The service could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const columnsFor = (rows: ServiceRow[]): Column<ServiceRow>[] => [
    {
      header: 'Service',
      mobile: 'title',
      cell: (s) => {
        const Icon = ICONS[s.icon]?.icon ?? Wrench;
        return (
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent/15 text-accent">
              {s.image_path ? (
                <img src={imageUrl(s.image_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <Icon className="h-4 w-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <div className="break-words font-medium text-fg">{s.name}</div>
              {s.description && <div className="mt-0.5 line-clamp-2 text-[11px] text-fg3">{s.description}</div>}
            </div>
          </div>
        );
      },
    },
    {
      header: 'From',
      mobile: 'corner',
      cell: (s) => (
        <div className="flex flex-col items-end gap-1 md:items-start">
          <span className="font-medium text-fg">{formatCurrency(s.price_from)}</span>
          {s.badge && <Badge tone={s.badge === 'Popular' ? 'info' : 'violet'}>{s.badge}</Badge>}
        </div>
      ),
    },
    { header: 'Duration', cell: (s) => s.duration_text ?? <span className="text-fg3">Not set</span> },
    {
      header: 'Active',
      cell: (s) =>
        canEdit ? (
          <label className="inline-flex cursor-pointer items-center gap-2 coarse:min-h-11">
            <input
              type="checkbox"
              checked={s.active}
              disabled={rowBusy === s.id}
              onChange={(e) => void toggleActive(s, e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
            />
            <span className={s.active ? 'text-ok' : 'text-fg3'}>{s.active ? 'Active' : 'Hidden'}</span>
            <span className="sr-only">: {s.name}</span>
          </label>
        ) : (
          <Badge tone={s.active ? 'ok' : 'neutral'}>{s.active ? 'Active' : 'Hidden'}</Badge>
        ),
    },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: (s) => {
        if (!canEdit) return <span className="text-fg3">View only</span>;
        const index = rows.findIndex((r) => r.id === s.id);
        return (
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${s.name} up`}
              disabled={index === 0 || rowBusy !== null}
              onClick={() => void move(s, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${s.name} down`}
              disabled={index === rows.length - 1 || rowBusy !== null}
              onClick={() => void move(s, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ service: s })}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${s.name}`}
              className="hover:!text-bad"
              onClick={() => {
                setDeleteError(null);
                setDeleting(s);
              }}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="p-4 pb-0 sm:p-5 sm:pb-0">
        <CardHeader
          title="Services"
          subtitle="What your website lists under Services, grouped by category. Hidden services stay here but are not shown."
          action={
            canEdit ? (
              <Button onClick={() => setEditing({ service: null })} disabled={!workshopId}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add service
              </Button>
            ) : undefined
          }
        />
        {!canEdit && <p className="mb-4 text-xs text-fg3">Only users with full Settings access can change services.</p>}
        {error && (
          <div className="mb-4">
            <ErrorNote errors={error} />
          </div>
        )}
      </div>

      {loading ? (
        <p role="status" className="px-4 pb-6 text-xs text-fg2 sm:px-5">
          Loading services...
        </p>
      ) : groups.length === 0 ? (
        !error && (
          <p className="px-4 pb-6 text-xs text-fg2 sm:px-5">
            No services yet.{canEdit ? ' Add your first service.' : ''}
          </p>
        )
      ) : (
        <div className="space-y-2 pb-2">
          {groups.map((g) => (
            <div key={g.id}>
              <h3 className="border-t border-line bg-surface2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg2 sm:px-5">
                {g.label} <span className="font-normal text-fg3">({g.rows.length})</span>
              </h3>
              <DataTable columns={columnsFor(g.rows)} rows={g.rows} getKey={(s) => s.id} />
            </div>
          ))}
        </div>
      )}

      {workshopId && editing && (
        <ServiceForm
          key={editing.service?.id ?? 'new'}
          workshopId={workshopId}
          service={editing.service}
          defaultSort={nextSortOrder(services)}
          onClose={() => setEditing(null)}
          onSaved={upsertLocal}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete service"
        message={
          <>
            Delete <strong className="text-fg">{deleting?.name}</strong>? It disappears from your website. To hide it for a
            while instead, turn off Active. This cannot be undone.
          </>
        }
        confirmLabel="Delete service"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

interface ServiceFormProps {
  workshopId: string;
  service: ServiceRow | null;
  defaultSort: number;
  onClose: () => void;
  onSaved: (row: ServiceRow) => void;
}

function ServiceForm({ workshopId, service, defaultSort, onClose, onSaved }: ServiceFormProps) {
  const formId = useId();
  const [draft, setDraft] = useState<ServiceDraft>(() => serviceDraft(service, defaultSort));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const f = (name: string) => `${formId}-${name}`;
  const original = service?.image_path ?? null;

  async function cancel() {
    await discardImages([draft.image_path], [original]);
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const checked = validateService(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const row = service ? await updateService(service.id, checked.value) : await createService(workshopId, checked.value);
      void discardImages([original], [row.image_path]);
      onSaved(row);
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'The service could not be saved.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={service ? `Edit ${service.name}` : 'Add service'}
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
            {busy ? 'Saving...' : service ? 'Save service' : 'Add service'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Labeled id={f('name')} label="Name">
            <input id={f('name')} className={inputClass} maxLength={80} required value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Labeled>
          <Labeled id={f('category')} label="Category">
            <select
              id={f('category')}
              className={inputClass}
              value={draft.category}
              onChange={(e) => set('category', e.target.value as ServiceDraft['category'])}
            >
              {SERVICE_CATEGORY_IDS.map((c) => (
                <option key={c} value={c}>
                  {SERVICE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        <Labeled id={f('description')} label="Description">
          <textarea
            id={f('description')}
            rows={3}
            maxLength={400}
            className={inputClass}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Labeled>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Labeled id={f('duration')} label="Duration" hint="For example 45 to 60 mins.">
            <input
              id={f('duration')}
              className={inputClass}
              maxLength={40}
              value={draft.duration_text}
              onChange={(e) => set('duration_text', e.target.value)}
            />
          </Labeled>
          <Labeled id={f('price')} label="Price from (CAD)">
            <input id={f('price')} className={inputClass} inputMode="decimal" value={draft.price_from} onChange={(e) => set('price_from', e.target.value)} />
          </Labeled>
          <Labeled id={f('badge')} label="Badge">
            <select id={f('badge')} className={inputClass} value={draft.badge} onChange={(e) => set('badge', e.target.value as ServiceDraft['badge'])}>
              <option value="">None</option>
              <option value="Popular">Popular</option>
              <option value="Recommended">Recommended</option>
            </select>
          </Labeled>
          <Labeled id={f('sort')} label="Sort order" hint="Lower comes first.">
            <input id={f('sort')} className={inputClass} inputMode="numeric" value={draft.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
          </Labeled>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-fg2">Icon</legend>
          <div className="flex flex-wrap gap-2">
            {SERVICE_ICONS.map((id) => {
              const { icon: Icon, label } = ICONS[id];
              const selected = draft.icon === id;
              return (
                <label
                  key={id}
                  className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 coarse:h-11 coarse:w-11 ${
                    selected ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-surface2 text-fg2 hover:text-fg'
                  }`}
                  title={label}
                >
                  <input type="radio" name={f('icon')} value={id} checked={selected} onChange={() => set('icon', id)} className="sr-only" />
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <ImageUpload
          label="Photo"
          hint="Optional. Shown instead of the icon where the website has room for a photo."
          multiple={false}
          value={draft.image_path ? [draft.image_path] : []}
          onChange={(paths) => set('image_path', paths[0] ?? null)}
          upload={(file) => uploadPublicImage(file, 'services', workshopId)}
          toUrl={imageUrl}
          onBusyChange={setUploading}
        />
        <CheckRow
          id={f('active')}
          label="Active"
          hint="Shown on your website. Turn off to hide it without deleting."
          checked={draft.active}
          onChange={(v) => set('active', v)}
        />
      </form>
    </Dialog>
  );
}
