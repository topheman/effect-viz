/**
 * The Execution Log row another view asked to show, such as a row link in the
 * Fiber Tree's Effect 4 changes.
 *
 * Kept outside React because `VisualizerPanel` mounts the log once per layout,
 * and the copy on screen, whichever it is, must scroll to the row.
 */
import { useSyncExternalStore } from "react";

import type { TraceEvent } from "@/types/trace";

/** A row of the log, tied to the trace it was asked on. */
export type LogTarget = {
  /** The run's first event: a row index means nothing in the next run. */
  run: TraceEvent;
  /** How many events the trace held when the row was asked for. */
  length: number;
  /** Index of the row in the full trace. */
  index: number;
};

let target: LogTarget | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LogTarget | null {
  return target;
}

/** Asks the log to show row `index` of `events`; a new object each time, so asking twice scrolls twice. */
export function targetLogRow(events: readonly TraceEvent[], index: number) {
  target = { run: events[0], length: events.length, index };
  for (const listener of listeners) listener();
}

/** Lets the log follow the newest row again. */
export function clearLogTarget(): void {
  target = null;
  for (const listener of listeners) listener();
}

/**
 * The full-trace index of the targeted row, while `events` is still the trace
 * it was asked on. A new event drops it: the log follows the newest row again.
 * On a finished run it stays, highlighted, until the next run.
 */
export function targetedIndex(
  target: LogTarget | null,
  events: readonly TraceEvent[],
): number | undefined {
  if (!target || target.run !== events[0] || target.length !== events.length) {
    return undefined;
  }
  return target.index;
}

/** The row last asked for, stale or not; `targetedIndex` says if it still applies. */
export function useLogTarget(): LogTarget | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
