/// <reference types="vite/client" />

/** The `effect` version this build resolves, injected by Vite. See vite.config.ts. */
declare const __EFFECT_VERSION__: string;

/** Monaco's path mapping to effect's declarations, injected by Vite from effect's package.json. See vite.config.ts. */
declare const __EFFECT_PATHS__: Record<string, string[]>;

interface ImportMetaEnv {
  /** The canonical deployed URL, from `.env`. */
  readonly VITE_WEBSITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
