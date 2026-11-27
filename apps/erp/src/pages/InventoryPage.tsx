import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVoiceAction } from '@/voice/useVoiceAction';
import { Cog, ImageOff, Plus } from 'lucide-react';
import { useVoice } from '@/voice/VoiceProvider';
import type { PartRow } from '@eurowerken/shared';
import { deletePart, imageUrl, listPartCosts, listParts } from '@/api/catalogue';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { PillTabs } from '@/components/ui/PillTabs';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatCurrency } from '@/lib/format';
import { STOCK_LABEL, STOCK_TONE, stockStatus } from '@/lib/status';
import { OnOrderLink, OpenOrdersLink, useOnOrder } from './inventory/OnOrder';
import { ConfirmDialog, ErrorNote, PartForm } from './inventory/PartForm';

const ALL = 'All';

const statusOf = (p: PartRow) => stockStatus({ stock: p.stock, minStock: p.min_stock });

export function InventoryPage() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('inventory', 'full');
  const { openVoice, supported: voiceSupported, voiceEnabled } = useVoice();
  const canSeeCost = can('inventory', 'view');

  const [parts, setParts] = useState<PartRow[]>([]);
  const [costs, setCosts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [editing, setEditing] = useState<{ part: PartRow | null } | null>(null);
  // Voice: "Add part to inventory" opens the new part form (staff who may change inventory only).
  const addFromVoice = useCallback(() => setEditing({ part: null }), []);
  useVoiceAction('add-part', addFromVoice, canEdit && Boolean(workshopId));
  const [deleting, setDeleting] = useState<PartRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const onOrder = useOnOrder(workshopId, canSeeCost);

  const load = useCallback(async () => {
    if (!workshopId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, costMap] = await Promise.all([
        listParts(workshopId),
        canSeeCost ? listPartCosts(workshopId) : Promise.resolve(new Map<string, number>()),
      ]);
      setParts(rows);
      setCosts(costMap);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Parts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workshopId, canSeeCost]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(parts.map((p) => p.category))).sort((a, b) => a.localeCompare(b)),
    [parts],
  );
  const tabs = useMemo(() => [ALL, ...categories], [categories]);

  useEffect(() => {
    if (category !== ALL && !categories.includes(category)) setCategory(ALL);
  }, [categories, category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter(
      (p) =>
        (category === ALL || p.category === category) &&
        (q === '' ||
          [p.name, p.sku, p.brand, p.part_number, p.slug, ...p.oem_refs].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [parts, search, category]);

  function onSaved(part: PartRow, unitCost: number | null) {
    setParts((list) => {
      const i = list.findIndex((p) => p.id === part.id);
      const next = i >= 0 ? list.map((p) => (p.id === part.id ? part : p)) : [...list, part];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    if (unitCost !== null) setCosts((m) => new Map(m).set(part.id, unitCost));
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePart(deleting);
      setParts((list) => list.filter((p) => p.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'The part could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns: Column<PartRow>[] = [
    {
      header: 'Part',
      mobile: 'title',
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl glass-field">
            {p.image_paths[0] ? (
              <img src={imageUrl(p.image_paths[0])} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <ImageOff className="h-4 w-4 text-fg3" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <div className="break-words font-medium text-fg">{p.name}</div>
            <div className="mt-0.5 break-words text-[10px] text-fg3">
              {[p.sku, p.brand].filter(Boolean).join(' · ') || 'No SKU'}
            </div>
          </div>
        </div>
      ),
    },
    { header: 'Category', cell: (p) => p.category },
    {
      header: 'Stock',
      cell: (p) => {
        const status = statusOf(p);
        const color = status === 'out' ? 'text-bad' : status === 'low' ? 'text-warn' : 'text-fg';
        return (
          <div className="flex flex-col items-start">
            <span className={`font-display text-base font-semibold ${color}`}>
              {p.stock}
              <span className="ml-1 text-[10px] font-normal text-fg3">min {p.min_stock}</span>
            </span>
            <OnOrderLink partId={p.id} onOrder={onOrder.get(p.id)} />
          </div>
        );
      },
    },
    { header: 'Price', cell: (p) => formatCurrency(p.price), className: 'font-medium text-fg' },
    ...(canSeeCost
      ? [
          {
            header: 'Unit cost',
            cell: (p: PartRow) => {
              const cost = costs.get(p.id);
              return cost === undefined ? <span className="text-fg3">Not set</span> : formatCurrency(cost);
            },
          } satisfies Column<PartRow>,
        ]
      : []),
    {
      header: 'Status',
      mobile: 'corner',
      cell: (p) => {
        const status = statusOf(p);
        return (
          <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
            <Badge tone={STOCK_TONE[status]}>{STOCK_LABEL[status]}</Badge>
            {p.published ? <Badge tone="info">Published</Badge> : <Badge tone="neutral">Hidden</Badge>}
          </div>
        );
      },
    },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: (p) =>
        canEdit ? (
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing({ part: p })} aria-label={`Edit ${p.name}`}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setDeleting(p);
              }}
              aria-label={`Delete ${p.name}`}
              className="hover:!text-bad"
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-fg3">View only</span>
        ),
    },
  ];

  let body;
  if (loading) {
    body = (
      <p role="status" className="px-4 py-10 text-center text-xs text-fg2">
        Loading parts...
      </p>
    );
  } else if (loadError) {
    body = (
      <div className="space-y-3 p-4">
        <ErrorNote errors={`Parts could not be loaded. ${loadError}`} />
        <Button variant="ghost" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  } else if (parts.length === 0) {
    body = null; // The empty state is its own centred card below.
  } else {
    body = <DataTable columns={columns} rows={filtered} getKey={(p) => p.id} emptyMessage="No parts match your search." />;
  }

  const empty = !loading && !loadError && parts.length === 0;

  return (
    <div className="space-y-4">
      {/* One frosted toolbar: search, categories, purchase orders, Add part. */}
      <div className="glass flex flex-col gap-3 rounded-2xl p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search parts, SKUs, brands" className="w-full sm:w-64" />
          {categories.length > 0 && <PillTabs label="Part category" options={tabs} value={category} onChange={setCategory} />}
          {canSeeCost && <OpenOrdersLink count={onOrder.size} />}
        </div>
        {canEdit && (
          <Button onClick={() => setEditing({ part: null })} disabled={!workshopId}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add part
          </Button>
        )}
      </div>

      {empty ? (
        <div className="flex justify-center pt-8 sm:pt-16">
          <Card className="flex w-full max-w-md flex-col items-center gap-3 px-6 py-8 text-center">
            <Cog className="h-14 w-14 text-fg3" strokeWidth={1.5} aria-hidden />
            <h2 className="font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">No parts yet. Add your first part.</h2>
            <p className="max-w-xs text-sm text-fg2">Parts you add here are tracked in stock and can be used on repair orders.</p>
            {canEdit && (
              <>
                <Button variant="ghost" onClick={() => setEditing({ part: null })} disabled={!workshopId} className="mt-1 text-fg">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add part
                </Button>
                {voiceEnabled && (
                <button
                  type="button"
                  onClick={() => openVoice({ listen: voiceSupported })}
                  className="text-sm text-fg2 underline-offset-4 transition hover:text-fg hover:underline"
                >
                  {voiceSupported ? 'Or say: Add brake pad to inventory' : 'Or type: Add brake pad to inventory'}
                </button>
                )}
              </>
            )}
          </Card>
        </div>
      ) : (
        <Card className="overflow-hidden">{body}</Card>
      )}

      {workshopId && (
        <PartForm
          open={editing !== null}
          workshopId={workshopId}
          part={editing?.part ?? null}
          unitCost={editing?.part ? (costs.get(editing.part.id) ?? null) : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete part"
        message={
          <>
            Delete <strong className="text-fg">{deleting?.name}</strong>? It is removed from your inventory and the parts shop,
            with its photos. This cannot be undone.
          </>
        }
        confirmLabel="Delete part"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
