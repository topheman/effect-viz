/**
 * Polyfills for browser compatibility issues.
 * Import this file early in the app (e.g., in main.tsx) to ensure polyfills are applied.
 */

/**
 * Safari iOS doesn't fully support the Clipboard API.
 * navigator.clipboard.write() is undefined and causes Monaco Editor to crash.
 * This provides a no-op fallback to prevent runtime errors.
 *
 * Note: The Clipboard API requires a secure context (HTTPS) on mobile browsers.
 * This issue typically occurs when testing on mobile devices over HTTP (e.g., local network).
 */
function polyfillClipboard(): void {
  if (typeof navigator === "undefined") return;

  if (!navigator.clipboard) {
    // @ts-expect-error - Creating a minimal clipboard polyfill
    navigator.clipboard = {};
  }

  if (!navigator.clipboard.write) {
    navigator.clipboard.write = async () => {};
  }

  if (!navigator.clipboard.writeText) {
    navigator.clipboard.writeText = async () => {};
  }

  if (!navigator.clipboard.read) {
    navigator.clipboard.read = async () => [];
  }

  if (!navigator.clipboard.readText) {
    navigator.clipboard.readText = async () => "";
  }
}

// Apply polyfills
polyfillClipboard();
