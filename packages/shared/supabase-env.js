// Build-time only (vite.config.ts). The browser apps need exactly two PUBLIC Supabase values: the project URL and
// the publishable (or anon) key. They are read under several names, because Vercel's Supabase integration adds
// SUPABASE_URL / NEXT_PUBLIC_SUPABASE_* while .env.local uses VITE_SUPABASE_*.
//
// Only these two values are passed to the app. Nothing else from the environment is exposed, and the build
// stops if the "key" is a secret one (service role or sb_secret_), so a secret can never be shipped to browsers.
import { loadEnv } from 'vite';

const URL_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const KEY_NAMES = [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
];

function first(env, names) {
  for (const n of names) {
    const v = (env[n] ?? '').trim();
    if (v) return v;
  }
  return '';
}

/** True for keys that must stay on servers: sb_secret_..., or a JWT whose role is service_role. */
function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      return payload && payload.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

/** Vite `define` entries for the two public values (empty strings when not set; the app then explains). */
export function supabaseDefines(mode, envDir) {
  // '' loads every variable from .env files and the process environment, so the names above can be read here;
  // only the two chosen values leave this function.
  const env = { ...loadEnv(mode, envDir, ''), ...process.env };
  const url = first(env, URL_NAMES);
  const key = first(env, KEY_NAMES);
  if (key && isSecretKey(key)) {
    throw new Error('A secret Supabase key was given as the public key. Use the publishable (or anon) key; secret keys must never reach the browser.');
  }
  return {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
  };
}
