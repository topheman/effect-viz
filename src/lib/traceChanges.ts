import type { FiberSuspendEvent, TraceEvent } from "@/types/trace";

import { resumesAtOnce } from "./traceHints";

/** A way Effect 4's runtime orders or forks fibers differently from Effect 3's. */
export type TraceChangeKind =
  /** A fiber resumes, unwinds and ends interrupted inside its interrupter's step. */
  | "synchronous-interruption"
  /** A joiner resumes inside its child's end, ahead of a fiber already queued. */
  | "joiner-runs-first"
  /** An operator's fork (`race`, `timeout`, concurrent `Effect.all`) starts the child at once; `forkChild` still queues it. */
  | "fork-runs-at-once"
  /** A concurrent `Effect.all` or `forEach` forks a fiber per element, each new one when a running one ends. */
  | "fiber-per-element"
  /** A retry with no delay still sleeps for zero, suspending between attempts. */
  | "zero-sleep-retry";

/** Every occurrence of one kind of change in a trace. */
export interface TraceChange {
  kind: TraceChangeKind;
  /** Indices in the full trace of the rows that show the change, ascending. */
  rows: number[];
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
  const found = new Map<TraceChangeKind, Set<number>>();
  const add = (kind: TraceChangeKind, rows: number[]) => {
    const entry = found.get(kind) ?? new Set();
    found.set(kind, entry);
    for (const row of rows) entry.add(row);
  };

  const parentOf = new Map<string, string>();
  for (const event of events) {
    if (event.type === "fiber:fork" && event.parentId) {
      parentOf.set(event.fiberId, event.parentId);
    }
  }

  // All hold the state before the row being read.
  const lastLifecycle = new Map<string, TraceEvent["type"]>();
  const lastSuspend = new Map<string, Suspended>();
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
        // A child interrupted before its first step resumes only to unwind:
        // that is the interruption, not the fork running it. Until the row
        // after the resume arrives, the trace cannot tell, and counting the
        // fork then would take it back.
        const after = events[i + 2];
        if (
          next?.type === "fiber:resume" &&
          next.fiberId === event.fiberId &&
          after !== undefined &&
          !(after.type === "fiber:interrupt" && after.fiberId === event.fiberId)
        ) {
          add("fork-runs-at-once", [i, i + 1]);
        }
        if (
          prev?.type === "fiber:end" &&
          parentOf.get(prev.fiberId) === parent &&
          lastLifecycle.get(parent) === "fiber:suspend"
        ) {
          // Effect 3's workers took the next element themselves, with no fork.
          add("fiber-per-element", [i - 1, i]);
        }
        break;
      }
      case "fiber:resume":
        resumedInside.set(event.fiberId, { row: i, host: running.at(-1) });
        running.push(event.fiberId);
        break;
      case "fiber:suspend":
        leave(event.fiberId);
        lastSuspend.set(event.fiberId, { row: i, event });
        break;
      case "fiber:end": {
        leave(event.fiberId);
        const queued = queuedBehindJoiner(events, i, parentOf, lastSuspend);
        if (queued !== undefined) add("joiner-runs-first", [i, i + 1, queued]);
        break;
      }
      case "fiber:interrupt": {
        // An interrupter that suspended to wait, as under Effect 3, is off the
        // stack by the time its target resumes, so the target has no host.
        const resumed = resumedInside.get(event.fiberId);
        if (resumed?.host !== undefined) {
          add("synchronous-interruption", [resumed.row, i]);
        }
        leave(event.fiberId);
        break;
      }
      case "retry:attempt": {
        const suspended = lastSuspend.get(event.fiberId);
        if (
          prev?.type === "fiber:resume" &&
          suspended !== undefined &&
          resumesAtOnce(suspended.event)
        ) {
          add("zero-sleep-retry", [suspended.row, i - 1]);
        }
        break;
      }
    }
    if (isLifecycle(event)) lastLifecycle.set(event.fiberId, event.type);
  });

  return [...found]
    .map(([kind, rows]) => ({ kind, rows: [...rows].sort((a, b) => a - b) }))
    .sort((a, b) => a.rows[0] - b.rows[0]);
}

/**
 * When the fiber ending at `end` resumes its parent, which joins it, on the
 * next row while another fiber had already yielded and was waiting for its
 * turn: the row where that fiber gets it. Effect 3 queued the joiner
 * behind it.
 *
 * A fiber was waiting for its turn when it yielded before `end` and resumes
 * after it. It must get its turn once the joiner has left the stack; a fiber
 * resumed inside the joiner's step was woken by the joiner, not queued behind
 * it.
 */
function queuedBehindJoiner(
  events: readonly TraceEvent[],
  end: number,
  parentOf: ReadonlyMap<string, string>,
  lastSuspend: ReadonlyMap<string, Suspended>,
): number | undefined {
  const ended = events[end];
  const resumed = events[end + 1];
  if (
    resumed?.type !== "fiber:resume" ||
    parentOf.get(ended.fiberId) !== resumed.fiberId
  ) {
    return undefined;
  }
  for (const [fiberId, suspended] of lastSuspend) {
    const row = events.findIndex(
      (e, j) => j > end + 1 && e.fiberId === fiberId,
    );
    if (row === -1) continue;
    const after = events[row];
    if (
      after.type === "fiber:resume" &&
      suspended.event.reason.kind === "yield" &&
      joinerLeft(events, end + 2, row, resumed.fiberId)
    ) {
      return row;
    }
  }
  return undefined;
}

/** A fiber's last suspend and its row. */
interface Suspended {
  row: number;
  event: FiberSuspendEvent;
}

/** Whether `fiberId` suspends or ends between rows `from` and `to`, `to` excluded. */
function joinerLeft(
  events: readonly TraceEvent[],
  from: number,
  to: number,
  fiberId: string,
): boolean {
  for (let j = from; j < to; j++) {
    const event = events[j];
    if (
      event.fiberId === fiberId &&
      (event.type === "fiber:suspend" ||
        event.type === "fiber:end" ||
        event.type === "fiber:interrupt")
    ) {
      return true;
    }
  }
  return false;
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
