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
export function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: Generate UUID v4 using crypto.getRandomValues or Math.random
  return generateUUIDv4();
}

/**
 * Fallback UUID v4 generator.
 * Uses crypto.getRandomValues if available, otherwise Math.random.
 */
function generateUUIDv4(): string {
  // Try to use crypto.getRandomValues for better randomness
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last resort: Math.random (not cryptographically secure, but works everywhere)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
