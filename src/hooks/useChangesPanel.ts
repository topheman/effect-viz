/**
 * Whether the Fiber Tree card shows the Effect 4 changes instead of the tree.
 *
 * Kept outside React because `VisualizerPanel` mounts the Fiber Tree once per
 * layout and CSS shows one of them; rotating a phone swaps which one is on
 * screen, and both must show the same thing. Keyed by the run's first event:
 * a new run starts on the tree.
 */
import { useSyncExternalStore } from "react";

import type { TraceEvent } from "@/types/trace";

/** The run the panel was opened on, or undefined when the tree shows. */
let openOn: TraceEvent | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TraceEvent | undefined {
  return openOn;
}

function update(next: TraceEvent | undefined): void {
  openOn = next;
  for (const listener of listeners) listener();
}

/** Opens the changes, or goes back to the tree. */
export function toggleChangesPanel(events: readonly TraceEvent[]): void {
  const open = openOn !== undefined && openOn === events[0];
  update(open ? undefined : events[0]);
}

/** Back to the tree. */
export function resetChangesPanel(): void {
  update(undefined);
}

/** Whether the changes show in place of the tree for the current run of `events`. */
export function useChangesPanel(events: readonly TraceEvent[]): boolean {
  const run = useSyncExternalStore(subscribe, getSnapshot);
  return run !== undefined && run === events[0];
}
