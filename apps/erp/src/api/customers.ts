/**
 * Typed read access to the workshop's customers (supabase/migrations/005 and
 * 006): the customer accounts linked to this workshop through
 * workshop_customers, with their vehicles. Staff only read these rows; the
 * customers own and edit their accounts on the customer website. Row level
 * security decides who sees them (the customers module, or repair orders or
 * invoices).
 */
import type { CustomerAccountRow, CustomerVehicleRow } from '@eurowerken/shared';
import { supabase } from '@/lib/supabase';
import { friendlyError } from './catalogue';

export type CustomerVehicle = Pick<CustomerVehicleRow, 'id' | 'make' | 'model' | 'year' | 'vin' | 'plate' | 'nickname'>;

export interface Customer extends Pick<CustomerAccountRow, 'id' | 'email' | 'full_name' | 'phone' | 'created_at'> {
  /** When the customer first used this workshop's site (workshop_customers.created_at). */
  linked_at: string;
  vehicles: CustomerVehicle[];
}

const SELECT = `
  created_at,
  customer:customer_accounts (
    id, email, full_name, phone, created_at,
    vehicles:customer_vehicles ( id, make, model, year, vin, plate, nickname, created_at )
  )
`;

interface LinkRow {
  created_at: string;
  customer:
    | (Pick<CustomerAccountRow, 'id' | 'email' | 'full_name' | 'phone' | 'created_at'> & {
        vehicles: (CustomerVehicle & { created_at: string })[] | null;
      })
    | null;
}

function toCustomer(row: LinkRow): Customer | null {
  // The account is null when RLS hides it (for example the role lost access).
  if (!row.customer) return null;
  const { vehicles, ...account } = row.customer;
  const sorted = [...(vehicles ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    ...account,
    linked_at: row.created_at,
    vehicles: sorted.map(({ created_at: _c, ...v }) => v),
  };
}

/** Display name: the full name, else the part of the email before the @. */
export function customerName(c: Pick<Customer, 'full_name' | 'email'>): string {
  return c.full_name?.trim() || c.email.split('@')[0] || c.email;
}

/** Customers linked to the workshop, newest first. */
export async function listCustomers(workshopId: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('workshop_customers')
    .select(SELECT)
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return ((data ?? []) as unknown as LinkRow[]).map(toCustomer).filter((c): c is Customer => c !== null);
}

/** One customer of the workshop, or null when not linked or not visible. */
export async function getCustomer(workshopId: string, customerId: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('workshop_customers')
    .select(SELECT)
    .eq('workshop_id', workshopId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error));
  return data ? toCustomer(data as unknown as LinkRow) : null;
}

/** The workshop's customer website address, or null when it has no site row. */
export async function getCustomerSiteUrl(workshopId: string): Promise<string | null> {
  const base = (import.meta.env.VITE_CUSTOMER_SITE_URL as string | undefined) ?? 'http://localhost:5175';
  const { data, error } = await supabase.from('workshop_sites').select('slug').eq('workshop_id', workshopId).maybeSingle();
  if (error || !data) return null;
  return `${base.replace(/\/+$/, '')}/${(data as { slug: string }).slug}`;
}
