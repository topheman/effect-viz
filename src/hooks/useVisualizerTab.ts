/**
 * The view a phone in landscape shows, one at a time: Fiber Tree, Execution Log
 * or Timeline.
 *
 * Kept outside React so that a link in one view can switch to another: the
 * Fiber Tree's row links open the Execution Log tab.
 */
import { useSyncExternalStore } from "react";

export type VisualizerTab = "fibers" | "log" | "timeline";

const initial: VisualizerTab = "log";

let tab: VisualizerTab = initial;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): VisualizerTab {
  return tab;
}

/** Shows `next` in the landscape tabs. */
export function setVisualizerTab(next: VisualizerTab): void {
  if (next === tab) return;
  tab = next;
  for (const listener of listeners) listener();
}

/** Back to the Execution Log tab, the one a fresh page opens on. */
export function resetVisualizerTab(): void {
  setVisualizerTab(initial);
}

/** The tab on screen in the landscape layout, and its setter. */
export function useVisualizerTab(): [
  VisualizerTab,
  (next: VisualizerTab) => void,
] {
  return [useSyncExternalStore(subscribe, getSnapshot), setVisualizerTab];
}
