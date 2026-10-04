/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_SIGNUP_URL?: string;
  readonly VITE_CHECKOUT_URL?: string;
  readonly VITE_API_DOCS_URL?: string;
  readonly VITE_LEAD_ENDPOINT?: string;
  readonly VITE_GTM_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
