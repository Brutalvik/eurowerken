import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined;

export const supabaseConfigured = Boolean(url && key);

/**
 * Browser client with the publishable key. Signed-out visitors can only read
 * what RLS allows them (published workshop sites). Customer sign-in comes later.
 */
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ew-customer-auth' },
});
