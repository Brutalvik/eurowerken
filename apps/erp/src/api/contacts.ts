/**
 * The workshop's own customers without an online account (supabase/migrations/033): imported from another shop
 * system, or added by staff. Everyone with Customers (view) or Repair Orders (view) reads them; Customers (full) or
 * Settings (full) may edit the contact details. New contacts come in through the import (api/dataImport).
 * A contact with linked_account_id is the same person as one of the workshop's online accounts.
 */
import { supabase } from '@/lib/supabase';

export interface ContactVehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  plate: string | null;
  odometer_km: number | null;
  notes: string | null;
}

export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  source: 'import' | 'manual';
  source_system: string | null;
  external_id: string | null;
  /** The online account this contact was linked to, when it is the same person. */
  linked_account_id: string | null;
  created_at: string;
  updated_at: string;
  vehicles: ContactVehicle[];
  /** Past visits imported for this customer. */
  imported_visits: number;
}

interface ContactRow extends Omit<Contact, 'vehicles' | 'imported_visits' | 'linked_account_id'> {
  customer_id: string | null;
  vehicles: ContactVehicle[] | null;
  visits: { count: number }[] | null;
}

const SELECT = `id, name, email, phone, address, notes, source, source_system, external_id, customer_id, created_at, updated_at,
  vehicles:contact_vehicles ( id, make, model, year, vin, plate, odometer_km, notes ),
  visits:imported_service_records ( count )`;

function toContact(r: ContactRow): Contact {
  const { customer_id, vehicles, visits, ...rest } = r;
  return { ...rest, linked_account_id: customer_id, vehicles: vehicles ?? [], imported_visits: visits?.[0]?.count ?? 0 };
}

function isMissing(err: { code?: string; message: string }): boolean {
  return err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|does not exist/i.test(err.message);
}

function contactError(err: { code?: string; message: string; details?: string | null }): Error {
  const text = `${err.message} ${err.details ?? ''}`;
  if (err.code === '23505' || /duplicate key/i.test(text)) {
    if (/phone/i.test(text)) return new Error('Another customer already has that phone number.');
    if (/email/i.test(text)) return new Error('Another customer already has that email address.');
    return new Error('Another customer already has those details.');
  }
  if (err.code === '42501' || /permission denied|row-level security/i.test(text)) return new Error('You do not have permission to change customers.');
  if (/does not look right/i.test(text)) return new Error('That email address does not look right.');
  if (/check constraint/i.test(text)) return new Error('A customer needs a name, email or phone, and each field has a length limit.');
  return new Error(err.message);
}

/** Every contact of the workshop with their cars, oldest first. Empty (not an error) before migration 033. */
export async function listContacts(workshopId: string): Promise<Contact[]> {
  const out: Contact[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('workshop_contacts')
      .select(SELECT)
      .eq('workshop_id', workshopId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      if (isMissing(error)) return [];
      throw contactError(error);
    }
    const page = (data ?? []) as unknown as ContactRow[];
    out.push(...page.map(toContact));
    if (page.length < 1000) break;
  }
  return out;
}

export type ContactPatch = Partial<Pick<Contact, 'name' | 'email' | 'phone' | 'address' | 'notes'>>;

/** Saves contact details. Empty strings clear a field; a contact keeps at least a name, email or phone. */
export async function updateContact(id: string, patch: ContactPatch): Promise<Contact> {
  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) clean[k] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  const { data, error } = await supabase.from('workshop_contacts').update(clean).eq('id', id).select(SELECT).maybeSingle();
  if (error) throw contactError(error);
  if (!data) throw new Error('The customer was not saved: it was not found, or you do not have permission to change it.');
  return toContact(data as unknown as ContactRow);
}

/** "Imported from Shopmonkey", "Added by staff" or "Imported". */
export function contactSourceLabel(c: Pick<Contact, 'source' | 'source_system'>): string {
  if (c.source === 'manual') return 'Added by staff';
  return c.source_system ? `Imported from ${c.source_system}` : 'Imported';
}

/** Display name: the name, else the email, else the phone. */
export function contactName(c: Pick<Contact, 'name' | 'email' | 'phone'>): string {
  return c.name?.trim() || c.email || c.phone || 'Customer';
}
