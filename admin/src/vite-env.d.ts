/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MAIL_STORAGE_URL?: string;
  readonly VITE_ADMIN_URL?: string;
  readonly VITE_NURSE_APP_URL?: string;
  readonly VITE_ADMIN_APP_URL?: string;
  readonly VITE_SHOW_PULL_SSO?: string;
  readonly VITE_NURSE_ANDROID_PACKAGE?: string;
  readonly VITE_PUSH_ENABLED?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
