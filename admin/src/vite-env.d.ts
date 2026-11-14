/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MAIL_STORAGE_URL?: string;
  readonly VITE_ADMIN_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
