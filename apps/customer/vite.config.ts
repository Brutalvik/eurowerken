import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { supabaseDefines } from '../../packages/shared/supabase-env.js';

// One .env.local at the repo root serves every app.
const envDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Only the Supabase URL and publishable key, under whichever name the host provides (see supabase-env.js).
  define: supabaseDefines(mode, envDir),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  envDir,
  server: {
    port: 5175,
  },
}));
