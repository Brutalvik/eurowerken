/**
 * Invoice PDFs made in the browser (migration 024). One design for printing, downloading and the emailed copy
 * (@eurowerken/shared/invoice-pdf), loaded only when a PDF is needed so pdf-lib stays out of the main bundle.
 *
 * The stored copy: when an issued invoice waits for its PDF (email_pending, or no pdf_path) and the user may store
 * it (Invoices or Repair Orders, full), the ERP renders it with the shop's privacy default, uploads it to
 * invoices/<workshop_id>/<invoice_id>.pdf and calls attach_invoice_pdf, which queues the invoice email.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import { attachInvoicePdf, getInvoiceHideContact, invoicePdfPath, uploadInvoicePdf } from './invoices';
import type { Invoice } from './invoices';

function loadPdfModule() {
  return import('@eurowerken/shared/invoice-pdf');
}

/** Builds the invoice PDF fresh from the database. Void invoices are marked VOID. */
export async function buildInvoicePdf(invoiceId: string, hideContact: boolean): Promise<{ bytes: Uint8Array; fileName: string }> {
  const m = await loadPdfModule();
  const doc = await m.loadInvoiceDocument(supabase, invoiceId);
  const bytes = await m.renderInvoicePdf(doc, { hideContact });
  return { bytes, fileName: m.invoicePdfName(doc) };
}

/** Builds the PDF and saves it as a file. */
export async function downloadInvoicePdf(invoiceId: string, hideContact: boolean): Promise<void> {
  const { bytes, fileName } = await buildInvoicePdf(invoiceId, hideContact);
  const m = await loadPdfModule();
  m.downloadPdf(bytes, fileName);
}

/** Builds the PDF and opens the browser's print dialog. */
export async function printInvoicePdf(invoiceId: string, hideContact: boolean): Promise<void> {
  const { bytes } = await buildInvoicePdf(invoiceId, hideContact);
  const m = await loadPdfModule();
  await m.printPdf(bytes);
}

// The stored copy --------------------------------------------------------------------------------------------

/** Invoices whose PDF is being made and stored right now, across the whole app. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Makes the invoice PDF with the shop's privacy default, stores it and attaches it (which queues the email if one
 * is waiting). At most one run per invoice at a time: a second caller waits for the running one.
 */
export function ensureInvoicePdf(invoice: Pick<Invoice, 'id' | 'workshop_id'>): Promise<void> {
  const running = inFlight.get(invoice.id);
  if (running) return running;
  const run = (async () => {
    const hideContact = await getInvoiceHideContact(invoice.workshop_id);
    const { bytes } = await buildInvoicePdf(invoice.id, hideContact);
    const path = invoicePdfPath(invoice);
    await uploadInvoicePdf(path, bytes);
    await attachInvoicePdf(invoice.id, path);
  })().finally(() => {
    inFlight.delete(invoice.id);
  });
  inFlight.set(invoice.id, run);
  return run;
}

/** An issued invoice still waiting for its stored PDF. */
export function invoiceNeedsPdf(invoice: Pick<Invoice, 'status' | 'email_pending' | 'pdf_path'>): boolean {
  return invoice.status === 'issued' && (invoice.email_pending || !invoice.pdf_path);
}

/** Staff who may store invoice PDFs (the storage policies and attach_invoice_pdf check this too). */
export function useCanStoreInvoicePdf(): boolean {
  const { can } = useAuth();
  return can('invoices', 'full') || can('repair-orders', 'full');
}

export function storeErrorMessage(err: unknown): string {
  const reason = err instanceof Error && err.message ? err.message : 'Unknown error.';
  return `The invoice PDF could not be stored: ${reason}`;
}

export interface EnsurePdfsHook {
  /** Failures by invoice id, already worded for staff. */
  errors: Map<string, string>;
  retry: (invoiceId: string) => void;
}

/**
 * Stores the PDF of every listed invoice that waits for one, one after another. A failure is kept until the
 * invoice changes (Realtime) or Try again is pressed; then it is tried again.
 */
export function useEnsureInvoicePdfs(invoices: Invoice[] | null): EnsurePdfsHook {
  const allowed = useCanStoreInvoicePdf();
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [attempt, setAttempt] = useState(0);

  const waiting = useMemo(() => (allowed && invoices ? invoices.filter(invoiceNeedsPdf) : []), [allowed, invoices]);
  // Runs again whenever a waiting invoice changes (its updated_at) or Try again is pressed.
  const key = waiting.map((i) => `${i.id}@${i.updated_at}`).join(',');

  useEffect(() => {
    const ids = new Set(waiting.map((i) => i.id));
    setErrors((prev) => {
      if ([...prev.keys()].every((id) => ids.has(id))) return prev;
      return new Map([...prev].filter(([id]) => ids.has(id)));
    });
    if (waiting.length === 0) return;
    let active = true;
    void (async () => {
      for (const inv of waiting) {
        if (!active) return;
        try {
          await ensureInvoicePdf(inv);
          if (!active) return;
          setErrors((prev) => {
            if (!prev.has(inv.id)) return prev;
            const next = new Map(prev);
            next.delete(inv.id);
            return next;
          });
        } catch (err) {
          if (!active) return;
          setErrors((prev) => new Map(prev).set(inv.id, storeErrorMessage(err)));
        }
      }
    })();
    return () => {
      active = false;
    };
    // `key` stands for `waiting`: a new list with the same invoices and versions needs no new run.
  }, [key, attempt]);

  const retry = useCallback((invoiceId: string) => {
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(invoiceId);
      return next;
    });
    setAttempt((n) => n + 1);
  }, []);

  return { errors, retry };
}

/** The same for one invoice (the repair order's Invoice card). */
export function useEnsureInvoicePdf(invoice: Invoice | null): { error: string | null; retry: () => void } {
  const list = useMemo(() => (invoice ? [invoice] : null), [invoice]);
  const { errors, retry } = useEnsureInvoicePdfs(list);
  const id = invoice?.id ?? null;
  return {
    error: id ? errors.get(id) ?? null : null,
    retry: useCallback(() => {
      if (id) retry(id);
    }, [id, retry]),
  };
}
