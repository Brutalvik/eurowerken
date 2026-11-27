/**
 * Automatic invoices and customer emails (migrations 023 and 024). An invoice is created by the database when a
 * repair order is marked Ready for pickup and waits for its PDF (email_pending). The ERP makes the PDF in the
 * browser (see invoicePdf.ts), stores it in the private "invoices" bucket and calls attach_invoice_pdf, which queues
 * the invoice email; the customer-mailer Edge Function sends the emails queued in customer_outbox.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';
import type { AppointmentVehicle } from './appointments';
import type { RepairStatus } from './repairOrders';
import { invoiceTaxLines } from '@eurowerken/shared';
import type { TaxLine } from '@eurowerken/shared';

// Types ------------------------------------------------------------------------------------------

export type InvoiceStatus = 'issued' | 'void';
export type OutboxState = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface InvoiceLine {
  kind: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface InvoiceBillTo {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Invoice {
  id: string;
  workshop_id: string;
  repair_order_id: string;
  number: string;
  status: InvoiceStatus;
  customer_id: string | null;
  bill_to: InvoiceBillTo;
  vehicle: AppointmentVehicle;
  lines: InvoiceLine[];
  subtotal: number;
  gst_rate: number;
  gst: number;
  /** Each tax charged (GST, PST, HST, QST, RST), from migration 029; one GST line for older invoices. */
  taxes: TaxLine[];
  total: number;
  /** Payments (migration 030): what has been paid and what is left. */
  amount_paid: number;
  balance: number;
  issued_at: string;
  updated_at: string;
  pdf_path: string | null;
  /** True after Ready for pickup or Send again, until the ERP has stored the PDF (the email waits for it). */
  email_pending: boolean;
  /** The repair order's number and status, when the user's role can see it. */
  repair_order: { number: string; status: RepairStatus } | null;
}

export interface OutboxRow {
  id: string;
  workshop_id: string;
  repair_order_id: string;
  invoice_id: string | null;
  kind: 'status' | 'invoice';
  status: RepairStatus | null;
  channel: 'email' | 'sms';
  to_address: string | null;
  state: OutboxState;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface CustomerEmailSettings {
  email_progress: boolean;
  email_invoice: boolean;
  sms_progress: boolean;
  /** The shop's starting choice: invoices show the customer's phone and email partly hidden. */
  invoice_hide_contact: boolean;
}

export const DEFAULT_EMAIL_SETTINGS: CustomerEmailSettings = {
  email_progress: true,
  email_invoice: true,
  sms_progress: false,
  invoice_hide_contact: true,
};

export const INVOICE_BUCKET = 'invoices';

// Errors -----------------------------------------------------------------------------------------

export const SETUP_MESSAGE = 'The database is not set up for invoices and customer emails yet. Apply migrations 023 and 024 (npm run db:migrate).';

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

function setupError(err: DbError | Error): Error {
  const message = err.message;
  const code = 'code' in err ? err.code : undefined;
  // Raised on purpose by the database functions ("Invoice not found.", "This invoice is void."): pass on as is.
  if (code === 'P0001') return new Error(message);
  if (
    code === '42P01' ||
    code === '42703' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    /relation .*(invoices|customer_outbox)|(invoices|customer_outbox|resend_invoice|set_customer_email_settings|set_invoice_privacy|attach_invoice_pdf|invoice_hide_contact|email_pending|email_progress|email_invoice|sms_progress).*(does not exist|not find|schema cache)|schema cache|bucket not found/i.test(message)
  ) {
    return new Error(SETUP_MESSAGE);
  }
  return new Error(message);
}

// Shaping -----------------------------------------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function normalizeInvoice(row: Record<string, unknown>): Invoice {
  const bill = (row.bill_to && typeof row.bill_to === 'object' ? row.bill_to : {}) as Record<string, unknown>;
  const lines = Array.isArray(row.lines) ? (row.lines as Record<string, unknown>[]) : [];
  const ro = row.repair_order as { number?: string; status?: RepairStatus } | null | undefined;
  return {
    id: String(row.id),
    workshop_id: String(row.workshop_id),
    repair_order_id: String(row.repair_order_id),
    number: String(row.number ?? ''),
    status: row.status === 'void' ? 'void' : 'issued',
    customer_id: text(row.customer_id),
    bill_to: { name: text(bill.name), email: text(bill.email), phone: text(bill.phone) },
    vehicle: (row.vehicle && typeof row.vehicle === 'object' ? row.vehicle : {}) as AppointmentVehicle,
    lines: lines.map((l) => ({
      kind: String(l.kind ?? ''),
      description: String(l.description ?? ''),
      quantity: num(l.quantity),
      unit_price: num(l.unit_price),
      amount: num(l.amount),
    })),
    subtotal: num(row.subtotal),
    gst_rate: num(row.gst_rate),
    gst: num(row.gst),
    taxes: invoiceTaxLines(row),
    total: num(row.total),
    amount_paid: num(row.amount_paid),
    balance: row.balance === null || row.balance === undefined ? num(row.total) - num(row.amount_paid) : num(row.balance),
    issued_at: String(row.issued_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    pdf_path: text(row.pdf_path),
    email_pending: row.email_pending === true,
    repair_order: ro && ro.number ? { number: ro.number, status: ro.status as RepairStatus } : null,
  };
}

function normalizeOutbox(row: Record<string, unknown>): OutboxRow {
  return {
    id: String(row.id),
    workshop_id: String(row.workshop_id),
    repair_order_id: String(row.repair_order_id),
    invoice_id: text(row.invoice_id),
    kind: row.kind === 'invoice' ? 'invoice' : 'status',
    status: (text(row.status) as RepairStatus | null) ?? null,
    channel: row.channel === 'sms' ? 'sms' : 'email',
    to_address: text(row.to_address),
    state: (['pending', 'sending', 'sent', 'failed', 'skipped'].includes(String(row.state)) ? row.state : 'pending') as OutboxState,
    attempts: num(row.attempts),
    last_error: text(row.last_error),
    created_at: String(row.created_at ?? ''),
    sent_at: text(row.sent_at),
  };
}

// Reading -----------------------------------------------------------------------------------------

const INVOICE_SELECT = '*, repair_order:repair_orders(number, status)';
const OUTBOX_SELECT = 'id, workshop_id, repair_order_id, invoice_id, kind, status, channel, to_address, state, attempts, last_error, created_at, sent_at';

/** The workshop's invoices, newest first, with the repair order number. */
export async function listInvoices(workshopId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('workshop_id', workshopId)
    .order('issued_at', { ascending: false })
    .limit(2000);
  if (error) throw setupError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeInvoice);
}

/** The invoice of one repair order, or null when it has none yet. */
export async function getInvoiceForRepair(repairOrderId: string): Promise<Invoice | null> {
  const { data, error } = await supabase.from('invoices').select(INVOICE_SELECT).eq('repair_order_id', repairOrderId).maybeSingle();
  if (error) throw setupError(error);
  return data ? normalizeInvoice(data as Record<string, unknown>) : null;
}

/** Every customer email (and text) of one repair order, newest first. */
export async function listRepairOutbox(repairOrderId: string): Promise<OutboxRow[]> {
  const { data, error } = await supabase
    .from('customer_outbox')
    .select(OUTBOX_SELECT)
    .eq('repair_order_id', repairOrderId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw setupError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeOutbox);
}

/** The latest invoice email of each invoice of the workshop, by invoice id. */
export async function listLatestInvoiceEmails(workshopId: string): Promise<Map<string, OutboxRow>> {
  const { data, error } = await supabase
    .from('customer_outbox')
    .select(OUTBOX_SELECT)
    .eq('workshop_id', workshopId)
    .eq('kind', 'invoice')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw setupError(error);
  return latestByInvoice(((data ?? []) as Record<string, unknown>[]).map(normalizeOutbox));
}

/** The newest row per invoice; rows must be newest first. */
export function latestByInvoice(rows: OutboxRow[]): Map<string, OutboxRow> {
  const map = new Map<string, OutboxRow>();
  for (const r of rows) {
    if (r.kind === 'invoice' && r.invoice_id && !map.has(r.invoice_id)) map.set(r.invoice_id, r);
  }
  return map;
}

// Actions -----------------------------------------------------------------------------------------

/**
 * Marks the invoice to be emailed again: the stored PDF is cleared and the email waits for a fresh one, which the
 * caller must then make and attach (ensureInvoicePdf). Needs Invoices or Repair Orders (full).
 */
export async function resendInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.rpc('resend_invoice', { p_invoice: invoiceId });
  if (error) throw setupError(error);
}

/**
 * Creates the invoice of a ready or completed repair that has none (for example one finished before invoicing
 * existed). With send, the PDF is stored and emailed as at Ready for pickup; without, it is only filed.
 */
export async function createInvoice(repairOrderId: string, send: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('create_invoice', { p_repair_order: repairOrderId, p_send: send });
  if (error) {
    if (/create_invoice/i.test(error.message) && /function|schema cache/i.test(error.message)) {
      throw new Error('The database is not set up to create invoices by hand yet. Apply migration 026 (npm run db:migrate).');
    }
    throw setupError(error);
  }
  return String(data);
}

/** Where an invoice's PDF is stored in the bucket; attach_invoice_pdf accepts only this path. */
export function invoicePdfPath(invoice: Pick<Invoice, 'id' | 'workshop_id'>): string {
  return `${invoice.workshop_id}/${invoice.id}.pdf`;
}

/** Stores the PDF (replacing any earlier copy). Needs Invoices or Repair Orders (full). */
export async function uploadInvoicePdf(path: string, bytes: Uint8Array): Promise<void> {
  const body = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, body, { upsert: true, contentType: 'application/pdf' });
  if (error) throw setupError(error);
}

/** Records the stored PDF; queues the invoice email if one is waiting. */
export async function attachInvoicePdf(invoiceId: string, path: string): Promise<void> {
  const { error } = await supabase.rpc('attach_invoice_pdf', { p_invoice: invoiceId, p_path: path });
  if (error) throw setupError(error);
}

// Settings -----------------------------------------------------------------------------------------

/** The shop's customer email switches; a workshop without a settings row has the defaults. */
export async function getCustomerEmailSettings(workshopId: string): Promise<CustomerEmailSettings> {
  const { data, error } = await supabase
    .from('workshop_notification_settings')
    .select('email_progress, email_invoice, sms_progress, invoice_hide_contact')
    .eq('workshop_id', workshopId)
    .maybeSingle();
  if (error) throw setupError(error);
  const row = data as Partial<CustomerEmailSettings> | null;
  if (!row) return { ...DEFAULT_EMAIL_SETTINGS };
  return {
    email_progress: row.email_progress ?? true,
    email_invoice: row.email_invoice ?? true,
    sms_progress: row.sms_progress ?? false,
    invoice_hide_contact: row.invoice_hide_contact ?? true,
  };
}

export async function setCustomerEmailSettings(progress: boolean, invoice: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_customer_email_settings', { p_progress: progress, p_invoice: invoice });
  if (error) throw setupError(error);
}

/** The shop's starting choice for hiding the customer's phone and email on invoices. Needs Settings (full). */
export async function setInvoicePrivacy(hide: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_invoice_privacy', { p_hide: hide });
  if (error) throw setupError(error);
}

// The shop's invoice privacy default, read once per workshop and shared by every invoice button on screen.
const hideContactCache = new Map<string, Promise<boolean>>();

/** Whether the shop hides the customer's phone and email on invoices by default (true when it cannot be read). */
export function getInvoiceHideContact(workshopId: string): Promise<boolean> {
  let p = hideContactCache.get(workshopId);
  if (!p) {
    p = getCustomerEmailSettings(workshopId)
      .then((s) => s.invoice_hide_contact)
      .catch(() => {
        hideContactCache.delete(workshopId);
        return true;
      });
    hideContactCache.set(workshopId, p);
  }
  return p;
}

function rememberHideContact(workshopId: string, hide: boolean) {
  hideContactCache.set(workshopId, Promise.resolve(hide));
}

/** The shop's invoice privacy default; null while it loads. */
export function useInvoiceHideContact(): boolean | null {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [hide, setHide] = useState<boolean | null>(null);
  useEffect(() => {
    if (!workshopId) return;
    let active = true;
    void getInvoiceHideContact(workshopId).then((h) => active && setHide(h));
    return () => {
      active = false;
    };
  }, [workshopId]);
  return hide;
}

export interface EmailSettingsHook {
  settings: CustomerEmailSettings | null;
  error: string | null;
  save: (progress: boolean, invoice: boolean) => Promise<string | null>;
  savePrivacy: (hide: boolean) => Promise<string | null>;
}

/** The workshop's customer email settings, kept current while the page is open. */
export function useCustomerEmailSettings(): EmailSettingsHook {
  const { user } = useAuth();
  const workshopId = user?.workshop?.id ?? null;
  const [settings, setSettings] = useState<CustomerEmailSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workshopId) return;
    try {
      const next = await getCustomerEmailSettings(workshopId);
      rememberHideContact(workshopId, next.invoice_hide_contact);
      setSettings(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Customer email settings could not be loaded.');
    }
  }, [workshopId]);

  useEffect(() => {
    void load();
    if (!workshopId) return;
    const channel = supabase
      .channel(`email-settings-${workshopId}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_notification_settings', filter: `workshop_id=eq.${workshopId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workshopId, load]);

  const save = useCallback(async (progress: boolean, invoice: boolean) => {
    try {
      await setCustomerEmailSettings(progress, invoice);
      setSettings((s) => ({ ...(s ?? DEFAULT_EMAIL_SETTINGS), email_progress: progress, email_invoice: invoice }));
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'The change could not be saved.';
    }
  }, []);

  const savePrivacy = useCallback(
    async (hide: boolean) => {
      try {
        await setInvoicePrivacy(hide);
        if (workshopId) rememberHideContact(workshopId, hide);
        setSettings((s) => ({ ...(s ?? DEFAULT_EMAIL_SETTINGS), invoice_hide_contact: hide }));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'The change could not be saved.';
      }
    },
    [workshopId],
  );

  return { settings, error, save, savePrivacy };
}

// Live updates ------------------------------------------------------------------------------------------

/** Live changes to any invoice or customer email of the workshop. Returns the unsubscribe function. */
export function subscribeInvoices(workshopId: string, onChange: (table: 'invoices' | 'customer_outbox') => void): () => void {
  const channel = supabase.channel(`invoices:${workshopId}:${Math.random().toString(36).slice(2)}`);
  for (const table of ['invoices', 'customer_outbox'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `workshop_id=eq.${workshopId}` }, () => onChange(table));
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Live changes to the invoice and customer emails of one repair order. Returns the unsubscribe function. */
export function subscribeRepairInvoice(repairOrderId: string, onChange: (table: 'invoices' | 'customer_outbox') => void): () => void {
  const channel = supabase.channel(`repair-invoice:${repairOrderId}:${Math.random().toString(36).slice(2)}`);
  for (const table of ['invoices', 'customer_outbox'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `repair_order_id=eq.${repairOrderId}` }, () => onChange(table));
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// Display helpers ---------------------------------------------------------------------------------------

/** j***@example.com */
export function maskEmail(address: string | null | undefined): string {
  const a = (address ?? '').trim();
  const at = a.lastIndexOf('@');
  if (at < 1) return a ? `${a.slice(0, 1)}***` : '';
  return `${a.slice(0, 1)}***${a.slice(at)}`;
}

export interface EmailStateView {
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  /** The error or the reason it was not sent. */
  detail: string | null;
  /** When it was sent, or when it was queued. */
  at: string | null;
}

/**
 * How an outbox row reads to staff: Sent, Waiting to send, Failed, or Not sent with the reason. While the invoice
 * waits for its PDF (`pdfPending`), the email is not queued yet: Preparing the PDF.
 */
export function emailStateView(row: OutboxRow | null | undefined, pdfPending = false): EmailStateView {
  if (pdfPending) return { label: 'Preparing the PDF', tone: 'warn', detail: null, at: null };
  if (!row) return { label: 'Not sent', tone: 'neutral', detail: 'No email yet', at: null };
  switch (row.state) {
    case 'sent':
      return { label: 'Sent', tone: 'ok', detail: null, at: row.sent_at ?? row.created_at };
    case 'failed':
      return { label: 'Failed', tone: 'bad', detail: row.last_error ?? 'The email could not be sent.', at: row.created_at };
    case 'skipped':
      return { label: 'Not sent', tone: 'neutral', detail: row.last_error ?? 'Skipped', at: row.created_at };
    default:
      return { label: 'Waiting to send', tone: 'warn', detail: null, at: row.created_at };
  }
}
