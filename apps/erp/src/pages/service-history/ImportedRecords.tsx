import { FileInput } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/format';

/** One past visit imported from another shop system: an item of service_history(key).imported (migration 033). */
export interface ImportedRecord {
  id: string;
  /** YYYY-MM-DD, a calendar date (no time, no time zone). */
  service_date: string;
  ro_number: string | null;
  description: string | null;
  mileage_km: number | null;
  total: number | null;
  source_system: string | null;
  imported_at: string | null;
  customer_name: string | null;
}

const strOrNull = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Shapes the raw `imported` array of service_history; anything that is not a record is left out. */
export function normalizeImported(raw: unknown): ImportedRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r) => ({
      id: String(r.id ?? ''),
      service_date: String(r.service_date ?? ''),
      ro_number: strOrNull(r.ro_number),
      description: strOrNull(r.description),
      mileage_km: numOrNull(r.mileage_km),
      total: numOrNull(r.total),
      source_system: strOrNull(r.source_system),
      imported_at: strOrNull(r.imported_at),
      customer_name: strOrNull(r.customer_name),
    }));
}

const dateFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** A calendar date as written, never shifted by a time zone. */
function formatServiceDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return dateFormat.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}

function formatImportedAt(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: tz }).format(d);
}

/**
 * Past visits from the shop's previous system, newest first, under the vehicle's EuroWerken repairs.
 * Accepts the raw `imported` array from service_history or already shaped records; renders nothing when empty.
 */
export function ImportedRecords({ records, tz }: { records: readonly ImportedRecord[] | readonly unknown[] | null | undefined; tz: string }) {
  const list = normalizeImported(records ?? []).sort((a, b) => b.service_date.localeCompare(a.service_date));
  if (list.length === 0) return null;
  const sources = Array.from(new Set(list.map((r) => r.source_system).filter(Boolean)));
  return (
    <section aria-labelledby="imported-history" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="imported-history" className="font-display text-sm font-semibold text-fg">
          Earlier visits ({list.length})
        </h2>
        <p className="text-[11px] text-fg3">
          {sources.length ? `Imported from ${sources.join(', ')}` : 'Imported from your previous system'} · read-only
        </p>
      </div>
      <ol className="space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <Card className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fg">
                    <time dateTime={r.service_date}>{formatServiceDate(r.service_date)}</time>
                    {r.ro_number && <span className="ml-2 font-normal text-fg2">RO {r.ro_number}</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-fg3">
                    {r.mileage_km !== null && <span>{r.mileage_km.toLocaleString('en-CA')} km</span>}
                    {r.customer_name && <span>{r.customer_name}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.total !== null && <span className="text-xs font-semibold text-fg">{formatCurrency(r.total)}</span>}
                  <Badge tone="neutral">
                    <FileInput className="mr-1 h-3 w-3" aria-hidden />
                    {r.source_system ? `Imported from ${r.source_system}` : 'Imported'}
                  </Badge>
                </div>
              </div>
              {r.description && <p className="mt-2 whitespace-pre-line break-words text-xs text-fg2">{r.description}</p>}
              {r.imported_at && <p className="mt-2 text-[10px] text-fg3">Imported {formatImportedAt(r.imported_at, tz)}</p>}
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
