import { useEffect, useState } from "react";

/** A phone in landscape. The `short:` variant in `src/index.css` repeats it. */
export const SHORT_VIEWPORT_QUERY = "(max-height: 500px)";

function isShortViewport(): boolean {
  return window.matchMedia(SHORT_VIEWPORT_QUERY).matches;
}

/**
 * Whether the WebContainer logs panel is open: closed on a short viewport,
 * open otherwise. Every rotation across the query resets it, so a phone turned
 * to landscape gives the editor the room and gets the logs back in portrait.
 */
export function useLogsPanelOpen() {
  const [open, setOpen] = useState(() => !isShortViewport());

  useEffect(() => {
    const query = window.matchMedia(SHORT_VIEWPORT_QUERY);
    const onChange = (event: MediaQueryListEvent) => setOpen(!event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return [open, setOpen] as const;
}
