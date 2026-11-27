/**
 * Invoices on the customer site (supabase/migrations/023 and 024).
 *
 * A signed-in customer can read their own issued invoices; guests cannot read any. RLS decides what is visible,
 * so "none" and "not yours" look the same here: no invoice. When the table is not there yet (an older database),
 * that is also "no invoice": customers never see a database error for this.
 */
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface InvoiceSummary {
  id: string;
  repair_order_id: string;
  number: string;
  issued_at: string;
  total: number;
  subtotal: number;
  gst: number;
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

const COLUMNS = 'id, repair_order_id, number, issued_at, total, subtotal, gst, status';

/** Missing table or column, or no access at all: treat as no invoice. */
function quietError(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42501' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /does not exist|could not find the table|schema cache|permission denied/i.test(error.message)
  );
}

function toSummary(row: Record<string, unknown>): InvoiceSummary {
  return {
    id: String(row.id),
    repair_order_id: String(row.repair_order_id),
    number: String(row.number ?? ''),
    issued_at: String(row.issued_at ?? ''),
    total: Number(row.total) || 0,
    subtotal: Number(row.subtotal) || 0,
    gst: Number(row.gst) || 0,
  };
}

/** The issued invoice for one repair, or null when there is none or it is not visible to this viewer. */
export async function invoiceForRepair(repairOrderId: string): Promise<Result<InvoiceSummary | null>> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(COLUMNS)
      .eq('repair_order_id', repairOrderId)
      .eq('status', 'issued')
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (quietError(error)) return { data: null, error: null };
      return { data: null, error: friendlyError(error.message) };
    }
    return { data: data ? toSummary(data as Record<string, unknown>) : null, error: null };
  } catch (e) {
    return { data: null, error: friendlyError(e instanceof Error ? e.message : 'Could not load the invoice.') };
  }
}

/** Issued invoices for several repairs, keyed by repair id (the newest per repair). */
export async function invoicesForRepairs(ids: string[]): Promise<Result<Record<string, InvoiceSummary>>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return { data: {}, error: null };
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(COLUMNS)
      .in('repair_order_id', unique)
      .eq('status', 'issued')
      .order('issued_at', { ascending: false });
    if (error) {
      if (quietError(error)) return { data: {}, error: null };
      return { data: null, error: friendlyError(error.message) };
    }
    const byRepair: Record<string, InvoiceSummary> = {};
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const inv = toSummary(row);
      if (!byRepair[inv.repair_order_id]) byRepair[inv.repair_order_id] = inv;
    }
    return { data: byRepair, error: null };
  } catch (e) {
    return { data: null, error: friendlyError(e instanceof Error ? e.message : 'Could not load invoices.') };
  }
}

/** Builds the invoice PDF fresh and downloads or prints it. pdf-lib loads only here. Throws with a short message. */
export async function makeInvoicePdf(invoiceId: string, action: 'download' | 'print', hideContact: boolean): Promise<void> {
  const m = await import('@eurowerken/shared/invoice-pdf');
  let doc;
  try {
    doc = await m.loadInvoiceDocument(supabase, invoiceId);
  } catch (e) {
    throw new Error(friendlyError(e instanceof Error ? e.message : 'Could not load the invoice.'));
  }
  const bytes = await m.renderInvoicePdf(doc, { hideContact });
  if (action === 'download') m.downloadPdf(bytes, m.invoicePdfName(doc));
  else await m.printPdf(bytes);
}
