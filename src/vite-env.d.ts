/// <reference types="vite/client" />

/** The `effect` version this build resolves, injected by Vite. See vite.config.ts. */
declare const __EFFECT_VERSION__: string;

interface ImportMetaEnv {
  /** The canonical deployed URL, from `.env`. */
  readonly VITE_WEBSITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
