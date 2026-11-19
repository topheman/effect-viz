/**
 * Whether the Fiber Tree card shows the Effect 4 changes instead of the tree,
 * and which change is selected.
 *
 * Kept outside React because `VisualizerPanel` mounts the Fiber Tree once per
 * layout and CSS shows one of them; rotating a phone swaps which one is on
 * screen, and both must show the same thing. Keyed by the run's first event:
 * a new run starts on the tree.
 */
import { useSyncExternalStore } from "react";

import type { TraceChangeKind } from "@/lib/traceChanges";
import type { TraceEvent } from "@/types/trace";

/** Whether the changes show in place of the tree, and the selected change. */
export type ChangesPanel = {
  open: boolean;
  selected: TraceChangeKind | null;
};

type Stored = ChangesPanel & { run: TraceEvent | undefined };

const closed: ChangesPanel = { open: false, selected: null };

let state: Stored = { ...closed, run: undefined };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Stored {
  return state;
}

function update(next: Stored): void {
  state = next;
  for (const listener of listeners) listener();
}

/** The panel's state for the run that `events` holds. */
function changesPanelFor(
  stored: Stored,
  events: readonly TraceEvent[],
): ChangesPanel {
  return stored.run === events[0] ? stored : closed;
}

/** Opens the changes, or goes back to the tree. */
export function toggleChangesPanel(events: readonly TraceEvent[]): void {
  const current = changesPanelFor(state, events);
  update({ ...current, open: !current.open, run: events[0] });
}

/** Selects `kind`, or clears the selection when it is already selected. */
export function selectChange(
  events: readonly TraceEvent[],
  kind: TraceChangeKind,
): void {
  const current = changesPanelFor(state, events);
  update({
    ...current,
    selected: current.selected === kind ? null : kind,
    run: events[0],
  });
}

/** Back to the tree, with nothing selected. */
export function resetChangesPanel(): void {
  update({ ...closed, run: undefined });
}

/** The panel's state for the current run of `events`. */
export function useChangesPanel(events: readonly TraceEvent[]): ChangesPanel {
  return changesPanelFor(useSyncExternalStore(subscribe, getSnapshot), events);
}
