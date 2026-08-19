import { useState } from "react";

/**
 * Mobile detection via user agent.
 * Used for viewport-independent mobile device detection.
 */
export function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    ua,
  );
}

export function useIsMobile(): boolean {
  const [isMobile] = useState(() => isMobileUserAgent());
  return isMobile;
}

/**
 * Safari detection via user agent (desktop and iOS).
 * WebContainer has limited support on Safari (e.g. Play fails without devtools).
 */
export function isSafariUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("Chromium")
  );
}

/**
 * Check if the webcontainer override is enabled.
 *
 * `?webcontainer=1` returns true
 * `?webcontainer=0` returns false
 * If not set, returns null.
 */
export function isWebContainerOverrideEnabled(): boolean | null {
  if (typeof window === "undefined") return null;
  const webcontainer = new URLSearchParams(window.location.search).get(
    "webcontainer",
  );
  if (webcontainer === "1") return true;
  if (webcontainer === "0") return false;
  return null;
}

/**
 * Whether the browser supports WebContainer.
 * Returns false for mobile and Safari (use fallback path).
 * You can override this with `?webcontainer=1` or `?webcontainer=0`.
 */
export function canSupportWebContainer(): boolean {
  const override = isWebContainerOverrideEnabled();
  if (override !== null) return override;
  return !isMobileUserAgent() && !isSafariUserAgent();
}

export function useCanSupportWebContainer(): boolean {
  const [can] = useState(() => canSupportWebContainer());
  return can;
}

/**
 * Whether the fallback (no-WebContainer) path should be used: mobile/Safari
 * (subject to `?webcontainer=` override), or offline - WebContainer boots via
 * a cross-origin iframe we can't cache into, and StackBlitz doesn't reliably
 * support reload-while-offline itself (stackblitz/webcontainer-core#992).
 *
 * Check once at mount, not on a timer/listener: an already-booted container
 * keeps running offline fine, so this should only gate the initial boot
 * attempt, not tear down a working session.
 */
export function shouldUseFallback(): boolean {
  if (!canSupportWebContainer()) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  return false;
}
