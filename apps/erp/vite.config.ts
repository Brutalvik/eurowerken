import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // One .env.local at the repo root serves every app.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: {
    port: 5174,
  },
});
