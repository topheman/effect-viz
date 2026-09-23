/**
 * How the Execution Log is displayed: fiber indentation, hints, and which event
 * groups are hidden.
 *
 * Kept outside React because `VisualizerPanel` mounts the log once per layout
 * and CSS shows one of them; crossing the `md` breakpoint, e.g. rotating a
 * tablet, swaps which one is on screen, and both must show the same view.
 * Session only: a reload brings back the full log, so nobody returns to one
 * silently missing events.
 */
import { useSyncExternalStore } from "react";

import type { EventGroup } from "@/lib/eventGroups";

export type LogView = {
  indentByFiber: boolean;
  explain: boolean;
  hidden: ReadonlySet<EventGroup>;
};

const initial: LogView = {
  indentByFiber: true,
  explain: true,
  hidden: new Set(),
};

let view = initial;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LogView {
  return view;
}

export function updateLogView(patch: Partial<LogView>): void {
  view = { ...view, ...patch };
  for (const listener of listeners) listener();
}

export function resetLogView(): void {
  updateLogView(initial);
}

export function useLogView(): [LogView, (patch: Partial<LogView>) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot), updateLogView];
}
