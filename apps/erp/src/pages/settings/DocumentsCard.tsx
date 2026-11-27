import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Eye, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { PUBLIC_BUCKET } from '@eurowerken/shared';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { CheckRow, ErrorNote } from '../inventory/PartForm';

interface DocSettings {
  document_logo_url: string | null;
  document_show_logo: boolean;
  logo_url: string | null;
  display_name: string;
  accent_color: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tagline: string | null;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_SIDE = 600;

function setupError(message: string): string {
  return /document_logo_url|document_show_logo|schema cache/i.test(message)
    ? 'The database is not set up for document logos yet. Apply migration 025 (npm run db:migrate).'
    : message;
}

/** Any image the browser can draw, as a PNG no larger than 600 px (PDFs only take PNG or JPEG). */
async function toPng(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || 600;
    const h0 = img.naturalHeight || 600;
    const s = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * s));
    canvas.height = Math.max(1, Math.round(h0 * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not read the image.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Your browser could not read the image.');
    return blob;
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('Your browser') ? e : new Error('That file could not be opened as an image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The path inside workshop-public of a URL we stored, to delete the old file. */
function ownPath(url: string | null, workshopId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PUBLIC_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = decodeURIComponent(url.slice(at + marker.length));
  return path.startsWith(`${workshopId}/documents/`) ? path : null;
}

/** Settings, Documents: the logo on invoices, the service history PDF and (later) quotes. */
export function DocumentsCard() {
  const id = useId();
  const { user, can } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const canEdit = can('settings', 'full');
  const inputRef = useRef<HTMLInputElement>(null);
  const [s, setS] = useState<DocSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | 'toggle' | 'preview' | null>(null);
  const [announce, setAnnounce] = useState('');

  const load = useCallback(async () => {
    if (!workshopId) return;
    const { data, error: e } = await supabase.from('workshop_sites').select('*').eq('workshop_id', workshopId).maybeSingle();
    if (e) return setError(setupError(e.message));
    const row = (data ?? {}) as Record<string, unknown>;
    if (data && !('document_show_logo' in row)) return setError(setupError('document_show_logo'));
    setS({
      document_logo_url: (row.document_logo_url as string) ?? null,
      document_show_logo: row.document_show_logo !== false,
      logo_url: (row.logo_url as string) ?? null,
      display_name: String(row.display_name ?? user?.workshop?.name ?? 'Your workshop'),
      accent_color: (row.accent_color as string) ?? null,
      address: (row.address as string) ?? null,
      phone: (row.phone as string) ?? null,
      email: (row.email as string) ?? null,
      tagline: (row.tagline as string) ?? null,
    });
  }, [workshopId, user?.workshop?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<DocSettings>): Promise<boolean> {
    if (!workshopId) return false;
    const { error: e } = await supabase.from('workshop_sites').update(patch).eq('workshop_id', workshopId);
    if (e) {
      setError(setupError(e.message));
      return false;
    }
    setS((cur) => (cur ? { ...cur, ...patch } : cur));
    return true;
  }

  async function onFile(file: File | undefined) {
    if (!file || !workshopId || !s) return;
    setBusy('upload');
    setError(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image under 10 MB.');
      const png = await toPng(file);
      const path = `${workshopId}/documents/logo-${crypto.randomUUID()}.png`;
      const up = await supabase.storage.from(PUBLIC_BUCKET).upload(path, png, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
      if (up.error) throw new Error(up.error.message);
      const url = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
      const old = ownPath(s.document_logo_url, workshopId);
      if (await save({ document_logo_url: url, document_show_logo: true })) {
        if (old) void supabase.storage.from(PUBLIC_BUCKET).remove([old]);
        setAnnounce('Logo saved. It now shows on invoices and the service history.');
      } else {
        void supabase.storage.from(PUBLIC_BUCKET).remove([path]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The logo could not be uploaded.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!s || !workshopId) return;
    setBusy('remove');
    setError(null);
    const old = ownPath(s.document_logo_url, workshopId);
    if (await save({ document_logo_url: null })) {
      if (old) void supabase.storage.from(PUBLIC_BUCKET).remove([old]);
      setAnnounce('Document logo removed.');
    }
    setBusy(null);
  }

  async function preview() {
    if (!s) return;
    setBusy('preview');
    setError(null);
    const win = window.open('', '_blank');
    try {
      const m = await import('@eurowerken/shared/invoice-pdf');
      const now = new Date().toISOString();
      const bytes = await m.renderInvoicePdf(
        {
          shop: {
            name: s.display_name,
            tagline: s.tagline,
            address: s.address,
            phone: s.phone,
            email: s.email,
            accent: s.accent_color,
            logoUrl: m.documentLogoUrl(s as unknown as Record<string, unknown>),
          },
          number: 'INV-SAMPLE',
          issued_at: now,
          timeZone: 'America/Edmonton',
          bill_to: { name: 'Sample Customer', phone: '403 555 0142', email: 'sample.customer@example.com' },
          vehicle: { year: 2018, make: 'BMW', model: '330i', vin: 'WBA8B9G50JNU00000', plate: 'SAMPLE' },
          repair: { number: 'RO-SAMPLE', checked_in_at: now, completed_at: now, technician: 'Technician', customer_notes: 'A sample invoice to check how your logo looks.' },
          lines: [
            { kind: 'service', description: 'Synthetic Oil Service', quantity: 1, unit_price: 129.99 },
            { kind: 'part', description: 'Cabin air filter', quantity: 1, unit_price: 39.5 },
          ],
          declined: [],
          notes: [],
          gst_rate: 0.05,
        },
        { hideContact: true },
      );
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      if (win) win.location.href = url;
      else m.downloadPdf(bytes, 'Invoice-sample.pdf');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : 'The preview could not be made.');
    } finally {
      setBusy(null);
    }
  }

  const shown = s ? s.document_logo_url || s.logo_url : null;

  return (
    <Card className="p-4 md:p-5">
      <CardHeader
        title="Logo on documents"
        subtitle="Your logo at the top of invoices and the service history PDF (and quotes, when they are added). PNG, JPEG, WebP or SVG; it is saved as a PNG up to 600 px."
      />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {!s && !error && <p className="text-xs text-fg2">Loading...</p>}
      <ErrorNote errors={error} />
      {s && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-2">
              {shown && s.document_show_logo ? (
                <img src={shown} alt="Logo used on documents" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[11px] text-neutral-500">{s.document_show_logo ? 'No logo yet' : 'Logo turned off'}</span>
              )}
            </div>
            <div className="space-y-2 text-xs text-fg2">
              {s.document_logo_url ? (
                <p>Using your document logo.</p>
              ) : s.logo_url ? (
                <p>Using your website logo (it shows on documents only if it is a PNG or JPEG). Upload one to use a different logo.</p>
              ) : (
                <p>No logo yet. Documents show your shop name.</p>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={inputRef}
                    id={`${id}-file`}
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void onFile(f);
                    }}
                  />
                  <Button onClick={() => inputRef.current?.click()} disabled={busy !== null}>
                    {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
                    {busy === 'upload' ? 'Uploading...' : s.document_logo_url ? 'Replace logo' : 'Upload logo'}
                  </Button>
                  {s.document_logo_url && (
                    <Button variant="ghost" onClick={() => void remove()} disabled={busy !== null}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {busy === 'remove' ? 'Removing...' : 'Remove'}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => void preview()} disabled={busy !== null}>
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    {busy === 'preview' ? 'Preparing...' : 'Preview an invoice'}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {canEdit ? (
            <CheckRow
              id={`${id}-show`}
              label="Show the logo on invoices and other PDFs"
              hint="Off: documents show your shop name only."
              checked={s.document_show_logo}
              onChange={async (on) => {
                setBusy('toggle');
                setError(null);
                if (await save({ document_show_logo: on })) setAnnounce(on ? 'Logo turned on.' : 'Logo turned off.');
                setBusy(null);
              }}
            />
          ) : (
            <p className="text-xs text-fg2">Only staff with full access to Settings can change the logo.</p>
          )}
        </div>
      )}
    </Card>
  );
}
