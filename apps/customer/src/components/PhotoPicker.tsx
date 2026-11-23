import { useId, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { PHOTO_ACCEPT, customerPhotoPathFromUrl, customerPhotoUrl, removeCustomerPhoto, uploadCustomerPhoto } from '@/api/photos';
import { useCustomerAuth } from '@/auth/CustomerAuthContext';
import { Avatar } from '@/components/layout/AccountMenu';

const smallBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface2 disabled:opacity-60 coarse:min-h-11';

/**
 * A hidden file input with a button that opens it. onFile does the upload and returns an error message or null.
 * On phones, the picker offers the camera as well as the photo library.
 */
export function PhotoButton({
  label,
  busyLabel = 'Uploading...',
  onFile,
  className = smallBtn,
  ariaLabel,
}: {
  label: string;
  busyLabel?: string;
  onFile: (file: File) => Promise<string | null>;
  className?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    const err = await onFile(file);
    setBusy(false);
    setError(err);
  }

  return (
    <span className="inline-flex flex-col items-start">
      <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} onChange={(e) => void onChange(e)} className="sr-only" tabIndex={-1} aria-hidden />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={ariaLabel}
        aria-describedby={error ? errorId : undefined}
        className={className}
      >
        <Camera className="h-3.5 w-3.5" aria-hidden />
        {busy ? busyLabel : label}
      </button>
      {error && (
        <span id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-bad">
          {error}
        </span>
      )}
    </span>
  );
}

/** The customer's profile photo with Upload / Change and Remove. */
export function ProfilePhotoEditor({ compact = false }: { compact?: boolean }) {
  const { account, updateAccount } = useCustomerAuth();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  if (!account) return null;
  const has = !!account.avatar_url;

  async function upload(file: File): Promise<string | null> {
    if (!account) return 'Sign in first.';
    const old = customerPhotoPathFromUrl(account.avatar_url);
    const up = await uploadCustomerPhoto(account.id, file, 512);
    if (up.error !== null) return up.error;
    const err = await updateAccount({ avatar_url: customerPhotoUrl(up.data) });
    if (err) {
      void removeCustomerPhoto(up.data);
      return err;
    }
    void removeCustomerPhoto(old);
    setAnnounce('Profile photo saved.');
    return null;
  }

  async function remove() {
    if (!account) return;
    setRemoving(true);
    setError(null);
    const old = customerPhotoPathFromUrl(account.avatar_url);
    const err = await updateAccount({ avatar_url: null });
    setRemoving(false);
    if (err) setError(err);
    else {
      void removeCustomerPhoto(old);
      setAnnounce('Profile photo removed.');
    }
  }

  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'}`}>
      <Avatar size="lg" />
      <div className="min-w-0">
        {!compact && <p className="text-sm font-semibold text-fg">Profile photo</p>}
        {!compact && <p className="text-xs text-fg3">JPEG, PNG or WebP. It is resized, and location data is removed.</p>}
        <div className={`flex flex-wrap items-start gap-2 ${compact ? '' : 'mt-2'}`}>
          <PhotoButton label={has ? 'Change photo' : 'Upload photo'} onFile={upload} ariaLabel={has ? 'Change profile photo' : 'Upload profile photo'} />
          {has && (
            <button type="button" onClick={() => void remove()} disabled={removing} className={smallBtn} aria-label="Remove profile photo">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {removing ? 'Removing...' : 'Remove'}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-bad">
            {error}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  );
}
