/**
 * Parts suppliers (supabase/migrations/031). Read with Parts Inventory view (or Repair Orders view, to choose one
 * when ordering parts for a repair); added with Parts Inventory or Repair Orders full; edited and deactivated with
 * Parts Inventory full. Suppliers are never deleted, so old purchase orders keep their supplier.
 */
import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: string;
  workshop_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierInput = Pick<Supplier, 'name' | 'contact_name' | 'email' | 'phone' | 'account_number' | 'address' | 'website' | 'notes' | 'active'>;

export const PURCHASING_SETUP_MESSAGE = 'Purchasing is not set up in the database yet. Apply migration 031 (npm run db:migrate).';

interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}

/** Turns a database error into a sentence staff can act on. Shared with purchaseOrders.ts. */
export function setupError(err: DbError | Error): Error {
  const message = err.message ?? '';
  const code = 'code' in err ? err.code : undefined;
  // Raised on purpose by the database functions ("Purchase order not found.", "...only 1 left to receive"): as is.
  if (code === 'P0001') return new Error(message);
  if (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    /(suppliers|purchase_order|supplier_outbox|part_on_order|receive_po_lines|create_po_from_repair|mark_po_sent|cancel_po|attach_po_pdf_and_send).*(does not exist|not find|schema cache)|bucket not found/i.test(message)
  ) {
    return new Error(PURCHASING_SETUP_MESSAGE);
  }
  if (code === '23505' || /duplicate key/i.test(message)) {
    if (/suppliers/i.test(message)) return new Error('A supplier with that name already exists. Use a different name, or edit the existing one.');
    return new Error('That entry already exists.');
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error('You do not have permission to make this change.');
  }
  if (code === '23514' || /violates check constraint/i.test(message)) {
    if (/email/i.test(message)) return new Error('The email address does not look right.');
    return new Error('One of the values is not allowed (too long, negative or the wrong format). Check the fields and try again.');
  }
  if (code === '23503' || /foreign key/i.test(message)) return new Error('A linked record was not found. Reload the page and try again.');
  if (code === 'PGRST116') return new Error('The record was not found, or you do not have permission to change it.');
  if (/failed to fetch|network/i.test(message)) return new Error('Could not reach the server. Check your connection and try again.');
  return new Error(message || 'That did not work. Try again.');
}

function shape(row: Record<string, unknown>): Supplier {
  return row as unknown as Supplier;
}

/** All suppliers of the workshop (active first, then by name). */
export async function listSuppliers(workshopId: string): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').eq('workshop_id', workshopId).order('name');
  if (error) throw setupError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(shape).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function createSupplier(workshopId: string, input: SupplierInput): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').insert({ ...input, workshop_id: workshopId }).select('*').single();
  if (error) throw setupError(error);
  return shape(data as Record<string, unknown>);
}

export async function updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(patch).eq('id', id).select('*').single();
  if (error) throw setupError(error);
  return shape(data as Record<string, unknown>);
}

export function setSupplierActive(id: string, active: boolean): Promise<Supplier> {
  return updateSupplier(id, { active });
}

// Form draft ---------------------------------------------------------------------------------------------

export interface SupplierDraft {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  account_number: string;
  address: string;
  website: string;
  notes: string;
  active: boolean;
}

export function supplierDraft(s: Supplier | null): SupplierDraft {
  return {
    name: s?.name ?? '',
    contact_name: s?.contact_name ?? '',
    email: s?.email ?? '',
    phone: s?.phone ?? '',
    account_number: s?.account_number ?? '',
    address: s?.address ?? '',
    website: s?.website ?? '',
    notes: s?.notes ?? '',
    active: s?.active ?? true,
  };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateSupplier(d: SupplierDraft): { ok: true; value: SupplierInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const field = (label: string, text: string, max: number, min = 0): string | null => {
    const t = text.trim();
    if (min > 0 && t.length < min) errors.push(`${label} needs at least ${min} characters.`);
    if (t.length > max) errors.push(`${label} can be at most ${max} characters (now ${t.length}).`);
    return t || null;
  };
  const name = field('Name', d.name, 120, 2) ?? '';
  const email = field('Email', d.email, 254);
  if (email && !EMAIL.test(email)) errors.push('The email address does not look right (for example orders@supplier.com).');
  const value: SupplierInput = {
    name,
    contact_name: field('Contact name', d.contact_name, 120),
    email: email ? email.toLowerCase() : null,
    phone: field('Phone', d.phone, 40),
    account_number: field('Account number', d.account_number, 60),
    address: field('Address', d.address, 300),
    website: field('Website', d.website, 200),
    notes: field('Notes', d.notes, 2000),
    active: d.active,
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}
