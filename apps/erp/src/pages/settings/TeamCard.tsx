import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, UserRound } from 'lucide-react';
import type { TeamMemberRow } from '@eurowerken/shared';
import {
  createTeamMember,
  deleteTeamMember,
  discardImages,
  imageUrl,
  listTeamMembers,
  moveRow,
  nextSortOrder,
  teamDraft,
  updateTeamMember,
  uploadPublicImage,
  validateTeamMember,
} from '@/api/catalogue';
import type { TeamDraft } from '@/api/catalogue';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { CheckRow, ConfirmDialog, Dialog, ErrorNote, Labeled, inputClass } from '../inventory/PartForm';

/**
 * Public technician profiles for the website's Experts page. Editing needs
 * full Settings or full Users & Roles access (enforced by RLS).
 */
export function TeamCard() {
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full') || can('users', 'full');
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ member: TeamMemberRow | null } | null>(null);
  const [deleting, setDeleting] = useState<TeamMemberRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    setLoading(true);
    setError(null);
    try {
      setMembers(await listTeamMembers(workshopId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The team could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order);

  function upsertLocal(row: TeamMemberRow) {
    setMembers((list) => (list.some((m) => m.id === row.id) ? list.map((m) => (m.id === row.id ? row : m)) : [...list, row]));
  }

  async function togglePublic(m: TeamMemberRow, isPublic: boolean) {
    setError(null);
    setRowBusy(m.id);
    upsertLocal({ ...m, is_public: isPublic });
    try {
      upsertLocal(await updateTeamMember(m.id, { is_public: isPublic }));
    } catch (err) {
      upsertLocal(m);
      setError(err instanceof Error ? err.message : 'The profile could not be changed.');
    } finally {
      setRowBusy(null);
    }
  }

  async function move(m: TeamMemberRow, direction: -1 | 1) {
    setError(null);
    setRowBusy(m.id);
    try {
      setMembers(await moveRow('team_members', members, m.id, direction));
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
      await deleteTeamMember(deleting);
      setMembers((list) => list.filter((m) => m.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'The profile could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns: Column<TeamMemberRow>[] = [
    {
      header: 'Member',
      mobile: 'title',
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-accent">
            {m.photo_path ? (
              <img src={imageUrl(m.photo_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <UserRound className="h-4 w-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <div className="break-words font-medium text-fg">{m.name}</div>
            {m.role_title && <div className="mt-0.5 text-[11px] text-fg3">{m.role_title}</div>}
          </div>
        </div>
      ),
    },
    {
      header: 'Visibility',
      mobile: 'corner',
      cell: (m) =>
        canEdit ? (
          <label className="inline-flex cursor-pointer items-center gap-2 coarse:min-h-11">
            <input
              type="checkbox"
              checked={m.is_public}
              disabled={rowBusy === m.id}
              onChange={(e) => void togglePublic(m, e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
            />
            <span className={m.is_public ? 'text-ok' : 'text-fg3'}>{m.is_public ? 'Public' : 'Hidden'}</span>
            <span className="sr-only">: {m.name}</span>
          </label>
        ) : (
          <Badge tone={m.is_public ? 'ok' : 'neutral'}>{m.is_public ? 'Public' : 'Hidden'}</Badge>
        ),
    },
    { header: 'Experience', cell: (m) => (m.years != null ? `${m.years} yr${m.years === 1 ? '' : 's'}` : <span className="text-fg3">Not set</span>) },
    {
      header: 'Specialties',
      cell: (m) => (m.specialties.length > 0 ? m.specialties.join(', ') : <span className="text-fg3">None</span>),
    },
    {
      header: 'Actions',
      mobile: 'footer',
      cell: (m) => {
        if (!canEdit) return <span className="text-fg3">View only</span>;
        const index = sorted.findIndex((r) => r.id === m.id);
        return (
          <div className="flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" aria-label={`Move ${m.name} up`} disabled={index === 0 || rowBusy !== null} onClick={() => void move(m, -1)}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${m.name} down`}
              disabled={index === sorted.length - 1 || rowBusy !== null}
              onClick={() => void move(m, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Edit ${m.name}`} onClick={() => setEditing({ member: m })}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${m.name}`}
              className="hover:!text-bad"
              onClick={() => {
                setDeleteError(null);
                setDeleting(m);
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
          title="Team"
          subtitle="Technician profiles on your website's Experts page. Hidden profiles are kept but not shown."
          action={
            canEdit ? (
              <Button onClick={() => setEditing({ member: null })} disabled={!workshopId}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add member
              </Button>
            ) : undefined
          }
        />
        {!canEdit && <p className="mb-4 text-xs text-fg3">Only users with full Settings or Users & Roles access can change the team.</p>}
        {error && (
          <div className="mb-4">
            <ErrorNote errors={error} />
          </div>
        )}
      </div>

      {loading ? (
        <p role="status" className="px-4 pb-6 text-xs text-fg2 sm:px-5">
          Loading team...
        </p>
      ) : members.length === 0 ? (
        !error && (
          <p className="px-4 pb-6 text-xs text-fg2 sm:px-5">
            No team members yet.{canEdit ? ' Add your first technician.' : ''}
          </p>
        )
      ) : (
        <div className="border-t border-line">
          <DataTable columns={columns} rows={sorted} getKey={(m) => m.id} />
        </div>
      )}

      {workshopId && editing && (
        <TeamForm
          key={editing.member?.id ?? 'new'}
          workshopId={workshopId}
          member={editing.member}
          defaultSort={nextSortOrder(members)}
          onClose={() => setEditing(null)}
          onSaved={upsertLocal}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete team member"
        message={
          <>
            Delete the profile of <strong className="text-fg">{deleting?.name}</strong>, with its photo? Their staff account, if
            any, is not affected. This cannot be undone.
          </>
        }
        confirmLabel="Delete profile"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

interface TeamFormProps {
  workshopId: string;
  member: TeamMemberRow | null;
  defaultSort: number;
  onClose: () => void;
  onSaved: (row: TeamMemberRow) => void;
}

function TeamForm({ workshopId, member, defaultSort, onClose, onSaved }: TeamFormProps) {
  const formId = useId();
  const [draft, setDraft] = useState<TeamDraft>(() => teamDraft(member, defaultSort));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof TeamDraft>(key: K, value: TeamDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const f = (name: string) => `${formId}-${name}`;
  const original = member?.photo_path ?? null;

  async function cancel() {
    await discardImages([draft.photo_path], [original]);
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const checked = validateTeamMember(draft, member?.profile_id ?? null);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const row = member ? await updateTeamMember(member.id, checked.value) : await createTeamMember(workshopId, checked.value);
      void discardImages([original], [row.photo_path]);
      onSaved(row);
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'The profile could not be saved.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={member ? `Edit ${member.name}` : 'Add team member'}
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
            {busy ? 'Saving...' : member ? 'Save profile' : 'Add member'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Labeled id={f('name')} label="Name">
            <input id={f('name')} className={inputClass} maxLength={80} required value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Labeled>
          <Labeled id={f('role')} label="Role title" hint="For example Master Technician.">
            <input id={f('role')} className={inputClass} maxLength={60} value={draft.role_title} onChange={(e) => set('role_title', e.target.value)} />
          </Labeled>
        </div>
        <Labeled id={f('bio')} label="Bio">
          <textarea id={f('bio')} rows={4} maxLength={600} className={inputClass} value={draft.bio} onChange={(e) => set('bio', e.target.value)} />
        </Labeled>
        <div className="grid gap-4 md:grid-cols-2">
          <Labeled id={f('specialties')} label="Specialties" hint="Separate with commas or new lines.">
            <textarea id={f('specialties')} rows={2} className={inputClass} value={draft.specialties} onChange={(e) => set('specialties', e.target.value)} />
          </Labeled>
          <Labeled id={f('makes')} label="Makes" hint="For example BMW, Audi, Porsche.">
            <textarea id={f('makes')} rows={2} className={inputClass} value={draft.makes} onChange={(e) => set('makes', e.target.value)} />
          </Labeled>
          <Labeled id={f('languages')} label="Languages" hint="Separate with commas or new lines.">
            <textarea id={f('languages')} rows={2} className={inputClass} value={draft.languages} onChange={(e) => set('languages', e.target.value)} />
          </Labeled>
          <Labeled id={f('certs')} label="Certifications" hint="Separate with commas or new lines.">
            <textarea id={f('certs')} rows={2} className={inputClass} value={draft.certifications} onChange={(e) => set('certifications', e.target.value)} />
          </Labeled>
          <Labeled id={f('years')} label="Years of experience">
            <input id={f('years')} className={inputClass} inputMode="numeric" value={draft.years} onChange={(e) => set('years', e.target.value)} />
          </Labeled>
          <Labeled id={f('sort')} label="Sort order" hint="Lower comes first.">
            <input id={f('sort')} className={inputClass} inputMode="numeric" value={draft.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
          </Labeled>
        </div>
        <ImageUpload
          label="Photo"
          hint="A portrait works best."
          multiple={false}
          value={draft.photo_path ? [draft.photo_path] : []}
          onChange={(paths) => set('photo_path', paths[0] ?? null)}
          upload={(file) => uploadPublicImage(file, 'team', workshopId)}
          toUrl={imageUrl}
          onBusyChange={setUploading}
        />
        <CheckRow
          id={f('public')}
          label="Public"
          hint="Shown on your website's Experts page."
          checked={draft.is_public}
          onChange={(v) => set('is_public', v)}
        />
      </form>
    </Dialog>
  );
}
