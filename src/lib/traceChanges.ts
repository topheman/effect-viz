import type { TraceEvent } from "@/types/trace";

import { sameInstant } from "./traceHints";

/** A way Effect 4's runtime orders or forks fibers differently from Effect 3's. */
export type TraceChangeKind =
  /** A fiber resumes, unwinds and ends interrupted inside its interrupter's step. */
  | "synchronous-interruption"
  /** A joiner resumes inside its child's end, ahead of a fiber already queued. */
  | "joiner-runs-first"
  /** An operator's fork starts the child at once instead of queuing it. */
  | "fork-runs-at-once"
  /** A concurrent `Effect.all` or `forEach` forks a fiber per element, the next from the end of the last. */
  | "fiber-per-element"
  /** A retry with no delay still sleeps for zero, suspending between attempts. */
  | "zero-sleep-retry";

/** Every occurrence of one kind of change in a trace. */
export interface TraceChange {
  kind: TraceChangeKind;
  /** Indices in the full trace of the rows that show the change, ascending. */
  rows: number[];
  /** Fibers involved, in order of first appearance in the trace. */
  fibers: string[];
}

/**
 * The Effect 3 → 4 runtime changes a trace shows, one entry per kind, ordered
 * by the first row that shows each kind.
 *
 * It reads the event sequence alone, so it holds for any program, edited ones
 * included. Each kind is a pattern that Effect 3's runtime could not produce;
 * when the change removed rows, such as the interrupter's suspend and resume,
 * the entry points at the row they would have surrounded. Like `traceHints`,
 * it relies on adjacency and must run on the full, unfiltered trace.
 */
export function traceChanges(events: readonly TraceEvent[]): TraceChange[] {
  const found = new Map<
    TraceChangeKind,
    { rows: Set<number>; fibers: Set<string> }
  >();
  const add = (kind: TraceChangeKind, rows: number[], fibers: string[]) => {
    const entry = found.get(kind) ?? { rows: new Set(), fibers: new Set() };
    found.set(kind, entry);
    for (const row of rows) entry.rows.add(row);
    for (const fiber of fibers) entry.fibers.add(fiber);
  };

  const parentOf = new Map<string, string>();
  for (const event of events) {
    if (event.type === "fiber:fork" && event.parentId) {
      parentOf.set(event.fiberId, event.parentId);
    }
  }

  // All hold the state before the row being read.
  const lastLifecycle = new Map<string, TraceEvent["type"]>();
  const lastSuspend = new Map<string, number>();
  // Fibers on the stack, innermost last: a fiber resumed while another runs
  // runs inside that fiber's step.
  const running: string[] = [];
  // For each fiber on the stack, its resume row and the fiber it resumed inside.
  const resumedInside = new Map<string, { row: number; host?: string }>();
  const leave = (fiberId: string) => {
    const at = running.lastIndexOf(fiberId);
    if (at !== -1) running.splice(at, 1);
    resumedInside.delete(fiberId);
  };

  events.forEach((event, i) => {
    const prev = events[i - 1];
    const next = events[i + 1];
    switch (event.type) {
      case "fiber:fork": {
        const parent = event.parentId;
        if (!parent) {
          // The root is discovered already running.
          running.push(event.fiberId);
          break;
        }
        if (next?.type === "fiber:resume" && next.fiberId === event.fiberId) {
          add("fork-runs-at-once", [i, i + 1], [parent, event.fiberId]);
        }
        if (
          prev?.type === "fiber:end" &&
          parentOf.get(prev.fiberId) === parent &&
          lastLifecycle.get(parent) === "fiber:suspend"
        ) {
          // Effect 3's workers took the next element themselves, with no fork.
          add(
            "fiber-per-element",
            [i - 1, i],
            [parent, prev.fiberId, event.fiberId],
          );
        }
        break;
      }
      case "fiber:resume":
        resumedInside.set(event.fiberId, { row: i, host: running.at(-1) });
        running.push(event.fiberId);
        break;
      case "fiber:suspend":
        leave(event.fiberId);
        lastSuspend.set(event.fiberId, i);
        break;
      case "fiber:end": {
        leave(event.fiberId);
        const queued = queuedBehindJoiner(events, i, parentOf, lastSuspend);
        if (queued) {
          add(
            "joiner-runs-first",
            [i, i + 1, queued.row],
            [event.fiberId, queued.joiner, queued.fiberId],
          );
        }
        break;
      }
      case "fiber:interrupt": {
        // An interrupter that suspended to wait, as under Effect 3, is off the
        // stack by the time its target resumes, so the target has no host.
        const resumed = resumedInside.get(event.fiberId);
        if (resumed?.host !== undefined) {
          add(
            "synchronous-interruption",
            [resumed.row, i],
            [resumed.host, event.fiberId],
          );
        }
        leave(event.fiberId);
        break;
      }
      case "retry:attempt": {
        const suspended = lastSuspend.get(event.fiberId);
        if (
          prev?.type === "fiber:resume" &&
          prev.fiberId === event.fiberId &&
          suspended !== undefined &&
          sameInstant(events[suspended].timestamp, prev.timestamp)
        ) {
          add("zero-sleep-retry", [suspended, i - 1], [event.fiberId]);
        }
        break;
      }
    }
    if (isLifecycle(event)) lastLifecycle.set(event.fiberId, event.type);
  });

  const firstSeen = new Map<string, number>();
  events.forEach((event, i) => {
    if (!firstSeen.has(event.fiberId)) firstSeen.set(event.fiberId, i);
  });
  const appearance = (fiberId: string) => firstSeen.get(fiberId) ?? Infinity;

  return [...found]
    .map(([kind, { rows, fibers }]) => ({
      kind,
      rows: [...rows].sort((a, b) => a - b),
      fibers: [...fibers].sort((a, b) => appearance(a) - appearance(b)),
    }))
    .sort((a, b) => a.rows[0] - b.rows[0]);
}

/**
 * When the fiber ending at `end` resumes its parent, which joins it, on the
 * next row while another fiber had already yielded and was waiting for its
 * turn: that fiber and the row where it gets it. Effect 3 queued the joiner
 * behind it.
 *
 * A fiber was waiting for its turn when it suspended before `end` and resumes
 * after it in the same instant as its suspend: a yield, not a timer.
 */
function queuedBehindJoiner(
  events: readonly TraceEvent[],
  end: number,
  parentOf: ReadonlyMap<string, string>,
  lastSuspend: ReadonlyMap<string, number>,
): { joiner: string; fiberId: string; row: number } | undefined {
  const ended = events[end];
  const resumed = events[end + 1];
  if (
    resumed?.type !== "fiber:resume" ||
    parentOf.get(ended.fiberId) !== resumed.fiberId ||
    !sameInstant(ended.timestamp, resumed.timestamp)
  ) {
    return undefined;
  }
  for (const [fiberId, suspended] of lastSuspend) {
    if (fiberId === resumed.fiberId) continue;
    const row = events.findIndex(
      (e, j) => j > end + 1 && e.fiberId === fiberId,
    );
    if (row === -1) continue;
    const after = events[row];
    if (
      after.type === "fiber:resume" &&
      sameInstant(events[suspended].timestamp, after.timestamp)
    ) {
      return { joiner: resumed.fiberId, fiberId, row };
    }
  }
  return undefined;
}

function isLifecycle(event: TraceEvent): boolean {
  return (
    event.type === "fiber:fork" ||
    event.type === "fiber:suspend" ||
    event.type === "fiber:resume" ||
    event.type === "fiber:end" ||
    event.type === "fiber:interrupt"
  );
}
