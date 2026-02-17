import { useState } from "react";

/**
 * Mobile detection via user agent.
 * Used to skip WebContainer boot and use fallback path (readonly editor, in-browser play).
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
