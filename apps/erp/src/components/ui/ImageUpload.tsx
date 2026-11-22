import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';

interface ImageUploadProps {
  /** Visible label, also the accessible name of the file picker. */
  label: string;
  /** Stored image paths (or URLs) currently attached. */
  value: string[];
  onChange: (paths: string[]) => void;
  /** Uploads one file and resolves to its stored path; rejects with a readable message. */
  upload: (file: File) => Promise<string>;
  /** Turns a stored path into a URL for the preview. */
  toUrl: (path: string) => string;
  /** Several images (default) or one; picking a new single image replaces the old one. */
  multiple?: boolean;
  max?: number;
  hint?: string;
  disabled?: boolean;
  /** Tells the parent an upload is running, so it can hold the save button. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Picks images, uploads them straight away and shows previews with remove
 * buttons. Removing only detaches the image here; the form decides whether
 * the stored file is deleted (after a save) or kept.
 */
export function ImageUpload({
  label,
  value,
  onChange,
  upload,
  toUrl,
  multiple = true,
  max = 8,
  hint,
  disabled = false,
  onBusyChange,
}: ImageUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const limit = multiple ? max : 1;
  const room = multiple ? limit - value.length : 1;
  const busy = progress !== null;
  const blocked = disabled || busy || room <= 0;

  async function handleFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (files.length === 0 || disabled || busy) return;
    const problems: string[] = [];
    const picked = files.slice(0, Math.max(room, 0));
    if (files.length > picked.length) problems.push(`Only ${limit} image${limit === 1 ? '' : 's'} allowed. Extra files were skipped.`);
    if (picked.length === 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    setProgress({ done: 0, total: picked.length });
    onBusyChange?.(true);
    const added: string[] = [];
    for (const file of picked) {
      try {
        added.push(await upload(file));
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name} could not be uploaded.`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    onBusyChange?.(false);
    setErrors(problems);
    if (added.length > 0) onChange(multiple ? [...value, ...added] : added.slice(-1));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!blocked) void handleFiles(e.dataTransfer.files);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function moveFirst(index: number) {
    const next = [...value];
    const [item] = next.splice(index, 1);
    onChange([item, ...next]);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg2">
        {label}
      </label>

      {value.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={`${label}: attached`}>
          {value.map((path, i) => (
            <li key={path} className="relative overflow-hidden rounded-lg border border-line bg-surface2">
              <img src={toUrl(path)} alt={`${label} ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
              {multiple && i === 0 && value.length > 1 && (
                <span className="absolute left-1 top-1 rounded bg-surface/90 px-1.5 py-0.5 text-[10px] font-semibold text-fg">
                  Main
                </span>
              )}
              {!disabled && (
                <div className="absolute right-1 top-1 flex gap-1">
                  {multiple && i > 0 && (
                    <button
                      type="button"
                      onClick={() => moveFirst(i)}
                      className="rounded-md bg-surface/90 px-1.5 text-[10px] font-semibold text-fg hover:bg-surface coarse:min-h-9 coarse:px-2"
                      aria-label={`Make image ${i + 1} the main image`}
                    >
                      Main
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-surface/90 text-bad hover:bg-surface coarse:h-9 coarse:w-9"
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (multiple ? room > 0 || busy : true) && (
        <>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={multiple}
            disabled={blocked}
            onChange={(e) => void handleFiles(e.target.files)}
            className="peer sr-only"
          />
          <label
            htmlFor={id}
            onDragOver={(e) => {
              e.preventDefault();
              if (!blocked) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center text-xs transition peer-focus-visible:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:cursor-not-allowed coarse:min-h-11 ${
              dragging ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface2 text-fg2 hover:border-accent hover:text-fg'
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>
                  Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}...
                </span>
              </>
            ) : (
              <>
                <ImagePlus className="h-4 w-4" aria-hidden />
                <span className="font-medium">
                  {multiple ? 'Add images' : value.length > 0 ? 'Replace image' : 'Add an image'}
                </span>
                <span className="text-[11px] text-fg3">JPEG, PNG or WebP, up to 5 MB. Click, or drop files here.</span>
              </>
            )}
          </label>
        </>
      )}

      {disabled && value.length === 0 && <p className="text-xs text-fg3">No image.</p>}
      {!disabled && multiple && room <= 0 && !busy && (
        <p className="text-[11px] text-fg3">
          {limit} images is the maximum. Remove one to add another.
        </p>
      )}
      {hint && <p className="mt-1 text-[11px] text-fg3">{hint}</p>}
      <div aria-live="polite" className="sr-only">
        {busy ? `Uploading ${progress.done} of ${progress.total} done` : ''}
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
