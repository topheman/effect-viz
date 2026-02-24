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
 * This is used to force the webcontainer mode on mobile and safari.
 */
export function isWebContainerOverrideEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("webcontainer") === "1"
  );
}

/**
 * Whether the browser supports WebContainer.
 * Returns false for mobile and Safari (use fallback path).
 */
export function canSupportWebContainer(): boolean {
  return (
    isWebContainerOverrideEnabled() ||
    (!isMobileUserAgent() && !isSafariUserAgent())
  );
}

export function useCanSupportWebContainer(): boolean {
  const [can] = useState(() => canSupportWebContainer());
  return can;
}
