import type { CustomerVehicleRow } from '@eurowerken/shared';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** A customer's own cars (customer_vehicles). RLS lets a customer read and write only their rows. */
const COLUMNS = 'id, customer_id, make, model, year, vin, plate, nickname, created_at';

export type VehicleInput = Pick<CustomerVehicleRow, 'make' | 'model' | 'year' | 'vin' | 'plate' | 'nickname'>;

type Result<T> = { data: T; error: null } | { data: null; error: string };

export async function listVehicles(customerId: string): Promise<Result<CustomerVehicleRow[]>> {
  const { data, error } = await supabase
    .from('customer_vehicles')
    .select(COLUMNS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: (data ?? []) as CustomerVehicleRow[], error: null };
}

export async function createVehicle(customerId: string, input: VehicleInput): Promise<Result<CustomerVehicleRow>> {
  const { data, error } = await supabase
    .from('customer_vehicles')
    .insert({ ...input, customer_id: customerId })
    .select(COLUMNS)
    .single();
  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as CustomerVehicleRow, error: null };
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<Result<CustomerVehicleRow>> {
  const { data, error } = await supabase.from('customer_vehicles').update(input).eq('id', id).select(COLUMNS).single();
  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as CustomerVehicleRow, error: null };
}

export async function deleteVehicle(id: string): Promise<string | null> {
  const { error } = await supabase.from('customer_vehicles').delete().eq('id', id);
  return error ? friendlyError(error.message) : null;
}
