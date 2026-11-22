import { createClient } from '@supabase/supabase-js';
import type { Role } from '@/auth/rbac';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Supabase now calls the browser key the publishable key (sb_publishable_...); older projects call it the anon key.
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined;

/** False when .env.local is missing the project URL or publishable key. The app shows a setup screen instead of crashing. */
export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Browser client. Uses the publishable (anon) key only: every read and write is
 * checked by row level security in the database (see supabase/migrations).
 * Never put the secret (service role) key in this app.
 */
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Row shape of public.profiles. */
export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role | null;
  department: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
}
