import { useCallback, useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { errorMessage } from '@/api/appointments';
import { createTemplate, deleteTemplate, duplicateTemplate, listTemplates, newItemKey, setDefaultTemplate, templateProblem, updateTemplate } from '@/api/inspections';
import type { InspectionTemplate, ItemType, TemplateItem } from '@/api/inspections';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog, ErrorNote, inputClass } from '../inventory/PartForm';
import { Confirm, SectionTitle, iconButton } from '../repair-orders/common';

/**
 * Settings: inspection templates (the checklists technicians fill in). Changing them needs Settings full (Managers by
 * default), because a template is shared set-up for the whole workshop; everyone with Repair Orders view can read them.
 * Inspections already started keep their own copy of the items, so editing a template never changes them.
 */
export function InspectionTemplatesCard() {
  const id = useId();
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const [list, setList] = useState<InspectionTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<InspectionTemplate | 'new' | null>(null);
  const [removing, setRemoving] = useState<InspectionTemplate | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [live, setLive] = useState('');

  const announce = (m: string) => {
    setLive('');
    window.setTimeout(() => setLive(m), 30);
  };

  const load = useCallback(async () => {
    if (!workshopId) return;
    try {
      setList(await listTemplates(workshopId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'The inspection templates could not be loaded.'));
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      announce(done);
    } catch (err) {
      setError(errorMessage(err, 'That did not work.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deleteTemplate(removing);
      announce(`${removing.name} deleted.`);
      setRemoving(null);
      await load();
    } catch (err) {
      setRemoveError(errorMessage(err, 'The template could not be deleted.'));
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <Card className="p-4 md:p-5">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <SectionTitle
          id={`${id}-title`}
          title="Inspection templates"
          subtitle="The checklists technicians fill in. The default one is chosen first. Changing a template does not change inspections already started."
          action={
            canEdit ? (
              <Button onClick={() => setEditing('new')}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New template
              </Button>
            ) : undefined
          }
        />
        <ErrorNote errors={error} />
        {list === null && !error ? (
          <p role="status" className="text-xs text-fg2">
            Loading templates...
          </p>
        ) : (
          <ul className="space-y-2">
            {(list ?? []).map((t) => {
              const sections = new Set(t.items.map((i) => i.section)).size;
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface2/40 p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                      <span className="break-words">{t.name}</span>
                      {t.is_default && <Badge tone="info">Default</Badge>}
                    </p>
                    <p className="text-[11px] text-fg3">
                      {t.items.length} items in {sections} section{sections === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {canEdit ? 'Edit' : 'View'}
                    </Button>
                    {canEdit && (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(`dup-${t.id}`, () => duplicateTemplate(t, list ?? []), `Copy of ${t.name} created.`)}>
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Duplicate
                        </Button>
                        {!t.is_default && (
                          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void act(`def-${t.id}`, () => setDefaultTemplate(t.id), `${t.name} is the default now.`)}>
                            <Star className="h-3.5 w-3.5" aria-hidden />
                            Make default
                          </Button>
                        )}
                        {!t.is_default && (
                          <button
                            type="button"
                            className={`${iconButton} hover:text-bad`}
                            aria-label={`Delete ${t.name}`}
                            onClick={() => {
                              setRemoveError(null);
                              setRemoving(t);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!canEdit && <p className="text-[11px] text-fg3">Changing templates needs full Settings access.</p>}
      </section>

      {editing !== null && workshopId && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          workshopId={workshopId}
          readOnly={!canEdit}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            setEditing(null);
            announce(`${t.name} saved.`);
            void load();
          }}
        />
      )}

      <Confirm
        open={removing !== null}
        title="Delete template"
        message={<p>Delete {removing?.name}? Inspections already started with it are kept. This cannot be undone.</p>}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={removeBusy}
        error={removeError}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

// Editor ---------------------------------------------------------------------------------------------------

type DraftItem = TemplateItem & { uid: string };

interface DraftSection {
  uid: string;
  name: string;
  items: DraftItem[];
}

let uidCounter = 0;
const uid = () => `s${(uidCounter += 1)}`;

function toSections(items: TemplateItem[]): DraftSection[] {
  const out: DraftSection[] = [];
  for (const it of items) {
    const s = out.find((x) => x.name === it.section);
    if (s) s.items.push({ ...it, uid: uid() });
    else out.push({ uid: uid(), name: it.section, items: [{ ...it, uid: uid() }] });
  }
  return out;
}

function toItems(sections: DraftSection[]): TemplateItem[] {
  const taken = new Set<string>();
  for (const s of sections) for (const it of s.items) if (it.key) taken.add(it.key);
  const out: TemplateItem[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      let key = it.key;
      if (!key) {
        key = newItemKey(it.label, taken);
        taken.add(key);
      }
      const { uid: _drop, unit, ...rest } = it;
      void _drop;
      out.push({ ...rest, key, section: s.name, ...(it.kind === 'measurement' && unit ? { unit } : {}) });
    }
  }
  return out;
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function TemplateEditor({
  template,
  workshopId,
  readOnly,
  onClose,
  onSaved,
}: {
  template: InspectionTemplate | null;
  workshopId: string;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (t: InspectionTemplate) => void;
}) {
  const id = useId();
  const [name, setName] = useState(template?.name ?? '');
  const [sections, setSections] = useState<DraftSection[]>(() =>
    template ? toSections(template.items) : [{ uid: uid(), name: 'General', items: [{ uid: uid(), key: '', section: 'General', label: '', kind: 'condition' }] }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const edit = (fn: (s: DraftSection[]) => DraftSection[]) => {
    setSections((s) => fn(s));
    setDirty(true);
  };
  const editItem = (si: number, ii: number, patch: Partial<DraftItem>) =>
    edit((s) => s.map((sec, a) => (a !== si ? sec : { ...sec, items: sec.items.map((it, b) => (b !== ii ? it : { ...it, ...patch })) })));

  async function save() {
    if (readOnly || busy) return;
    const items = toItems(sections.filter((s) => s.items.length > 0));
    const problem = templateProblem(name, items);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = template ? await updateTemplate(template.id, name, items) : await createTemplate(workshopId, name, items);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, 'The template could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  const close = () => (dirty && !readOnly ? setLeaving(true) : onClose());
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <>
      <Dialog
        open
        title={readOnly ? (template?.name ?? 'Template') : template ? `Edit ${template.name}` : 'New template'}
        onClose={close}
        footer={
          readOnly ? (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving...' : 'Save template'}
              </Button>
            </>
          )
        }
      >
        <fieldset disabled={readOnly} className="space-y-4">
          <div>
            <label htmlFor={`${id}-name`} className="mb-1 block text-xs font-medium text-fg2">
              Template name
            </label>
            <input
              id={`${id}-name`}
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-fg3">{total} items. Technicians mark each one Good, Attention, Urgent or N/A; measurements also take a number.</p>
          </div>

          {sections.map((sec, si) => (
            <section key={sec.uid} aria-label={`Section ${sec.name || si + 1}`} className="space-y-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${id}-${sec.uid}`} className="mb-1 block text-[11px] font-medium text-fg2">
                    Section
                  </label>
                  <input
                    id={`${id}-${sec.uid}`}
                    value={sec.name}
                    maxLength={60}
                    onChange={(e) => edit((s) => s.map((x, a) => (a === si ? { ...x, name: e.target.value } : x)))}
                    className={`${inputClass} font-semibold`}
                  />
                </div>
                <button type="button" className={iconButton} aria-label={`Move section ${sec.name} up`} disabled={si === 0} onClick={() => edit((s) => move(s, si, -1))}>
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" className={iconButton} aria-label={`Move section ${sec.name} down`} disabled={si === sections.length - 1} onClick={() => edit((s) => move(s, si, 1))}>
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${iconButton} hover:text-bad`}
                  aria-label={`Remove section ${sec.name} and its items`}
                  disabled={sections.length === 1}
                  onClick={() => edit((s) => s.filter((_, a) => a !== si))}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              <ol className="space-y-2">
                {sec.items.map((it, ii) => {
                  const base = `${id}-${sec.uid}-${ii}`;
                  return (
                    <li key={it.uid} className="grid gap-2 rounded-lg bg-surface2/40 p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_auto]">
                      <div className="min-w-0">
                        <label htmlFor={`${base}-l`} className="sr-only">
                          Item name
                        </label>
                        <input id={`${base}-l`} value={it.label} maxLength={120} placeholder="Item name" onChange={(e) => editItem(si, ii, { label: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`${base}-k`} className="sr-only">
                          Kind of check
                        </label>
                        <select id={`${base}-k`} value={it.kind} onChange={(e) => editItem(si, ii, { kind: e.target.value as ItemType })} className={inputClass}>
                          <option value="condition">Condition</option>
                          <option value="measurement">Measurement</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${base}-u`} className="sr-only">
                          Unit
                        </label>
                        <input
                          id={`${base}-u`}
                          value={it.unit ?? ''}
                          maxLength={12}
                          placeholder={it.kind === 'measurement' ? 'Unit' : '—'}
                          disabled={it.kind !== 'measurement' || readOnly}
                          onChange={(e) => editItem(si, ii, { unit: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button type="button" className={iconButton} aria-label={`Move ${it.label || 'item'} up`} disabled={ii === 0} onClick={() => edit((s) => s.map((x, a) => (a === si ? { ...x, items: move(x.items, ii, -1) } : x)))}>
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={iconButton}
                          aria-label={`Move ${it.label || 'item'} down`}
                          disabled={ii === sec.items.length - 1}
                          onClick={() => edit((s) => s.map((x, a) => (a === si ? { ...x, items: move(x.items, ii, 1) } : x)))}
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={`${iconButton} hover:text-bad`}
                          aria-label={`Remove ${it.label || 'item'}`}
                          onClick={() => edit((s) => s.map((x, a) => (a === si ? { ...x, items: x.items.filter((_, b) => b !== ii) } : x)))}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      <div className="sm:col-span-4">
                        <label htmlFor={`${base}-h`} className="sr-only">
                          Help for the technician
                        </label>
                        <input
                          id={`${base}-h`}
                          value={it.help ?? ''}
                          maxLength={300}
                          placeholder="Help for the technician (optional)"
                          onChange={(e) => editItem(si, ii, { help: e.target.value })}
                          className={`${inputClass} text-[11px]`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
              {!readOnly && (
                <Button size="sm" variant="ghost" onClick={() => edit((s) => s.map((x, a) => (a === si ? { ...x, items: [...x.items, { uid: uid(), key: '', section: x.name, label: '', kind: 'condition' }] } : x)))}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add item
                </Button>
              )}
            </section>
          ))}

          {!readOnly && (
            <Button variant="ghost" onClick={() => edit((s) => [...s, { uid: uid(), name: 'New section', items: [{ uid: uid(), key: '', section: 'New section', label: '', kind: 'condition' }] }])}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add section
            </Button>
          )}
          <ErrorNote errors={error} />
        </fieldset>
      </Dialog>
      <Confirm
        open={leaving}
        title="Discard changes"
        message={<p>Close without saving? Your changes to this template are lost.</p>}
        confirmLabel="Discard"
        busyLabel="Discarding..."
        busy={false}
        error={null}
        onConfirm={() => {
          setLeaving(false);
          onClose();
        }}
        onCancel={() => setLeaving(false)}
      />
    </>
  );
}
