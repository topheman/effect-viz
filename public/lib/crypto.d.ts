/**
 * Crypto utilities with fallbacks for non-secure contexts.
 *
 * Note: `crypto.randomUUID()` requires a secure context (HTTPS) on mobile browsers.
 * This typically occurs when testing on mobile devices over HTTP (e.g., local network).
 */
/**
 * Generate a UUID v4.
 * Uses native `crypto.randomUUID()` when available, falls back to manual generation.
 */
export declare function randomUUID(): string;
