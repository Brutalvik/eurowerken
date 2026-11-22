import { useEffect, useId, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { errorMessage } from '@/api/appointments';
import { MEDIA_TYPES, checkMedia, deleteRepairMedia, mediaUrl, updateRepairMedia, uploadRepairMedia } from '@/api/repairOrders';
import type { RepairMedia, RepairOrder } from '@/api/repairOrders';
import { Card } from '@/components/ui/Card';
import { ErrorNote } from '../inventory/PartForm';
import { Confirm, SectionTitle, iconButton } from './common';

interface MediaCardProps {
  order: RepairOrder;
  media: RepairMedia[];
  canEdit: boolean;
  onMedia: (media: RepairMedia[]) => void;
  announce: (message: string) => void;
}

interface Progress {
  done: number;
  total: number;
  current: string;
}

/** Photos and videos of the repair: upload several at once, captions, customer visibility, delete. */
export function MediaCard({ order, media, canEdit, onMedia, announce }: MediaCardProps) {
  const id = useId();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, setRemoving] = useState<RepairMedia | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const problems: string[] = [];
    const ok = files.filter((f) => {
      const p = checkMedia(f);
      if (p) problems.push(p);
      return !p;
    });
    let list = media;
    let added = 0;
    for (let i = 0; i < ok.length; i += 1) {
      setProgress({ done: i, total: ok.length, current: ok[i].name });
      try {
        const m = await uploadRepairMedia(order, ok[i]);
        list = [...list, m];
        added += 1;
        onMedia(list);
      } catch (err) {
        problems.push(errorMessage(err, `${ok[i].name} could not be uploaded.`));
      }
    }
    setProgress(null);
    setErrors(problems);
    if (added > 0) announce(`${added} file${added === 1 ? '' : 's'} added.`);
  }

  async function save(m: RepairMedia, patch: { caption?: string | null; visible_to_customer?: boolean }) {
    try {
      const saved = await updateRepairMedia(m.id, patch);
      onMedia(media.map((x) => (x.id === saved.id ? saved : x)));
      announce(patch.visible_to_customer === undefined ? 'Caption saved.' : saved.visible_to_customer ? 'The customer can see it now.' : 'Hidden from the customer.');
    } catch (err) {
      setErrors([errorMessage(err, 'That could not be saved.')]);
    }
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deleteRepairMedia(removing);
      onMedia(media.filter((x) => x.id !== removing.id));
      announce(`${removing.kind === 'video' ? 'Video' : 'Photo'} deleted.`);
      setRemoving(null);
    } catch (err) {
      setRemoveError(errorMessage(err, 'It could not be deleted.'));
    } finally {
      setRemoveBusy(false);
    }
  }

  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card className="p-4 md:p-5">
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <SectionTitle
          id={`${id}-title`}
          title="Photos and video"
          subtitle="Up to 50 MB each. Visible ones show on the customer's tracking page."
          action={
            canEdit ? (
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:opacity-90 coarse:min-h-11 ${progress ? 'pointer-events-none opacity-50' : ''}`}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Upload
                <input type="file" multiple accept={MEDIA_TYPES.join(',')} onChange={(e) => void onFiles(e)} disabled={progress !== null} className="sr-only" />
              </label>
            ) : undefined
          }
        />

        <div aria-live="polite" role="status">
          {progress && (
            <div className="space-y-1">
              <p className="truncate text-[11px] text-fg2">
                Uploading {progress.done + 1} of {progress.total}: {progress.current}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(percent, 4)}%` }} />
              </div>
            </div>
          )}
        </div>
        <ErrorNote errors={errors.length ? errors : null} />

        {media.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-fg2">No photos or videos yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {media.map((m) => (
              <MediaTile key={m.id} media={m} canEdit={canEdit} onSave={(patch) => void save(m, patch)} onRemove={() => {
                setRemoveError(null);
                setRemoving(m);
              }} />
            ))}
          </ul>
        )}
      </section>

      <Confirm
        open={removing !== null}
        title={removing?.kind === 'video' ? 'Delete video' : 'Delete photo'}
        message={<p>Delete this {removing?.kind === 'video' ? 'video' : 'photo'}? The file is removed and the customer will no longer see it. This cannot be undone.</p>}
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

function MediaTile({
  media,
  canEdit,
  onSave,
  onRemove,
}: {
  media: RepairMedia;
  canEdit: boolean;
  onSave: (patch: { caption?: string | null; visible_to_customer?: boolean }) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [caption, setCaption] = useState(media.caption ?? '');
  useEffect(() => setCaption(media.caption ?? ''), [media.caption]);
  const url = mediaUrl(media.path);
  const label = media.caption || (media.kind === 'video' ? 'Repair video' : 'Repair photo');

  return (
    <li className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface2/40">
      <div className="aspect-video bg-sidebar/80">
        {media.kind === 'video' ? (
          <video src={url} controls playsInline preload="metadata" className="h-full w-full object-contain" aria-label={label} />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <img src={url} alt={label} loading="lazy" className="h-full w-full object-cover" />
          </a>
        )}
      </div>
      <div className="space-y-2 p-2.5">
        {canEdit ? (
          <>
            <input
              value={caption}
              maxLength={200}
              placeholder="Add a caption"
              aria-label="Caption"
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => caption.trim() !== (media.caption ?? '') && onSave({ caption })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="w-full rounded-lg border border-line bg-surface2 px-2.5 py-1.5 text-xs text-fg outline-none placeholder:text-fg3 focus:border-accent coarse:min-h-11"
            />
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${id}-vis`} className="flex min-w-0 items-center gap-2 text-[11px] text-fg2 coarse:min-h-11">
                <input
                  id={`${id}-vis`}
                  type="checkbox"
                  checked={media.visible_to_customer}
                  onChange={(e) => onSave({ visible_to_customer: e.target.checked })}
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))] coarse:h-5 coarse:w-5"
                />
                Visible to customer
              </label>
              <button type="button" onClick={onRemove} className={`${iconButton} hover:text-bad`} aria-label={`Delete ${label}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <>
            {media.caption && <p className="break-words text-xs text-fg">{media.caption}</p>}
            <p className="text-[11px] text-fg3">{media.visible_to_customer ? 'Customer can see this' : 'Staff only'}</p>
          </>
        )}
      </div>
    </li>
  );
}
