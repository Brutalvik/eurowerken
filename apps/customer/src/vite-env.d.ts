/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CUSTOMER_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SITE_SLUG?: string;
  /** The ERP's origin (for example https://erp.example.com), allowed to send the live preview its draft. */
  readonly VITE_ERP_ORIGIN?: string;
}
