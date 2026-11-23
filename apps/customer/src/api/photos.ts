import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/**
 * A customer's own photos (profile picture and one photo per car), in the public customer-photos bucket under
 * <customer id>/<uuid>.jpg. Storage rules (019) let a customer write only in their own folder.
 *
 * Every photo is redrawn in the browser before upload: it is made smaller, saved as JPEG and loses its
 * metadata (EXIF, which can hold where the photo was taken).
 */
export const CUSTOMER_PHOTOS_BUCKET = 'customer-photos';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

type Result<T> = { data: T; error: null } | { data: null; error: string };

export const PHOTO_ACCEPT = ACCEPTED.join(',');

export function customerPhotoUrl(path: string): string {
  return supabase.storage.from(CUSTOMER_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The storage path of a URL in our bucket (a profile photo we uploaded), or null for any other URL (Google). */
export function customerPhotoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${CUSTOMER_PHOTOS_BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
}

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The photo as a JPEG no larger than maxSide pixels on its longest side. */
export async function preparePhoto(file: File, maxSide: number): Promise<Result<Blob>> {
  if (!ACCEPTED.includes(file.type)) return { data: null, error: 'Choose a JPEG, PNG or WebP photo.' };
  if (file.size > MAX_INPUT_BYTES) return { data: null, error: 'That photo is too large. Choose one under 20 MB.' };
  let img: Awaited<ReturnType<typeof loadImage>>;
  try {
    img = await loadImage(file);
  } catch {
    return { data: null, error: 'We could not open that photo. Try another one.' };
  }
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: null, error: 'Your browser could not prepare the photo.' };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  if ('close' in img && typeof img.close === 'function') img.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob ? { data: blob, error: null } : { data: null, error: 'Your browser could not prepare the photo.' };
}

/** Prepare and upload a photo; returns its storage path. */
export async function uploadCustomerPhoto(customerId: string, file: File, maxSide: number): Promise<Result<string>> {
  const prepared = await preparePhoto(file, maxSide);
  if (prepared.error !== null) return prepared;
  const path = `${customerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(CUSTOMER_PHOTOS_BUCKET)
    .upload(path, prepared.data, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: path, error: null };
}

/** Remove a file we no longer use. Failures are ignored: the photo has already been replaced. */
export async function removeCustomerPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(CUSTOMER_PHOTOS_BUCKET).remove([path]);
}
