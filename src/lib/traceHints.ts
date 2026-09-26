import type { TraceEvent } from "@/types/trace";

import { eventDepth, fiberDepths } from "./fiberDepth";

/**
 * One-line explanations for trace rows that match a known runtime pattern,
 * keyed by the row's index in `events`.
 *
 * Every pattern is adjacency in trace order ("the next event", "nothing
 * between"), so this must run on the full, unfiltered trace: hiding rows in the
 * log must never change which hints fire. `indentByFiber` adds the hints that
 * explain how the indented log places rows.
 */
export function traceHints(
  events: readonly TraceEvent[],
  { indentByFiber }: { indentByFiber: boolean },
): Map<number, string> {
  const hints = new Map<number, string[]>();
  const add = (index: number, text: string) => {
    const row = hints.get(index);
    if (row) row.push(text);
    else hints.set(index, [text]);
  };

  const endedAt = new Map<string, number>();
  const suspended = new Set<string>();
  const inFinalizerRun = (i: number) => {
    const event = events[i];
    const isFinalizerOf = (other: TraceEvent | undefined) =>
      other?.type === "finalizer" && other.fiberId === event.fiberId;
    return isFinalizerOf(events[i - 1]) || isFinalizerOf(events[i + 1]);
  };

  events.forEach((event, i) => {
    const prev = events[i - 1];
    const next = events[i + 1];
    switch (event.type) {
      case "fiber:suspend": {
        if (endedAt.has(event.fiberId)) {
          // The runtime calls onSuspend in a `finally` after every run slice,
          // the last one included (`evaluateEffect`, internal/fiberRuntime.ts).
          add(
            i,
            "Every run ends with a suspend, even the last; the root has none because the visualizer's hooks are unwound by then.",
          );
        } else if (
          next?.type === "fiber:resume" &&
          next.fiberId === event.fiberId &&
          sameInstant(next.timestamp, event.timestamp)
        ) {
          add(
            i,
            "The fiber hit an async boundary that was already settled, so it resumed at once.",
          );
        } else if (!isHandoff(event, next)) {
          add(i, "Async boundary: the fiber parks and frees the thread.");
        }
        suspended.add(event.fiberId);
        break;
      }
      case "fiber:resume": {
        const handoff = isHandoff(prev, event) ? prev : undefined;
        if (!suspended.has(event.fiberId)) {
          add(
            i,
            `Forking only queues ${event.fiberId}; it first runs here, once ${handoff ? handoff.fiberId : "the running fiber"} yields.`,
          );
        } else if (handoff) {
          add(
            i,
            `${handoff.fiberId} ${endedAt.has(handoff.fiberId) ? "finished" : "parked"}, so the runtime ran the next ready fiber, ${event.fiberId}.`,
          );
        } else if (
          !(
            prev?.type === "fiber:suspend" &&
            prev.fiberId === event.fiberId &&
            sameInstant(prev.timestamp, event.timestamp)
          )
        ) {
          // An instant resume is explained on its suspend.
          add(i, "Time the fiber spent parked.");
        }
        break;
      }
      case "fiber:end":
      case "fiber:interrupt":
        endedAt.set(event.fiberId, i);
        break;
      case "effect:end":
        if (
          event.result === "failure" &&
          interruptedNext(events, i, event.fiberId)
        ) {
          add(i, "Interruption ends the open span as a failure.");
        }
        break;
      case "finalizer":
        if (inFinalizerRun(i)) {
          add(i, "Finalizers run in reverse order of registration.");
        }
        break;
    }
  });

  if (indentByFiber) addIndentHints(events, add);

  return new Map([...hints].map(([index, texts]) => [index, texts.join(" ")]));
}

type Suspend = Extract<TraceEvent, { type: "fiber:suspend" }>;

/**
 * Events stamped closer than this belong to one synchronous burst of the
 * runtime. Virtual time runs on with wall time (runtime/virtualClock.ts) and the
 * tracer, supervisor and runner each read it themselves, so a burst spans a few
 * milliseconds and span stamps can be a millisecond early. Speed never exceeds
 * 1, so a burst is no wider in virtual time; a shorter sleep reads as instant.
 */
const SAME_INSTANT_MS = 10;

function sameInstant(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_INSTANT_MS;
}

/** `prev` parked and another fiber took the thread in the same instant. */
function isHandoff(
  prev: TraceEvent | undefined,
  next: TraceEvent | undefined,
): prev is Suspend {
  return (
    prev?.type === "fiber:suspend" &&
    next?.type === "fiber:resume" &&
    next.fiberId !== prev.fiberId &&
    sameInstant(next.timestamp, prev.timestamp)
  );
}

/**
 * Whether the fiber's next lifecycle event is an interrupt, with only span ends
 * and finalizers between: the unwinding of an interruption. An interrupted fiber
 * runs nothing but that unwinding before it reports the interrupt, so the order
 * is enough; timestamps are not, since a slow machine stretches the unwinding
 * well past `SAME_INSTANT_MS`.
 */
function interruptedNext(
  events: readonly TraceEvent[],
  from: number,
  fiberId: string,
): boolean {
  for (const event of events.slice(from + 1)) {
    if (event.fiberId !== fiberId) continue;
    if (event.type === "fiber:interrupt") return true;
    if (event.type !== "effect:end" && event.type !== "finalizer") return false;
  }
  return false;
}

/** First occurrence of each placement rule the indented log follows. */
function addIndentHints(
  events: readonly TraceEvent[],
  add: (index: number, text: string) => void,
) {
  const depths = fiberDepths(events);
  const firstIndex = (match: (event: TraceEvent) => boolean) =>
    events.findIndex(match);

  const childFork = firstIndex((e) => e.type === "fiber:fork" && !!e.parentId);
  if (childFork !== -1) {
    add(
      childFork,
      "Indented with the fiber that forked it: forking is that fiber's action, and the child's rows start at its first resume.",
    );
  }

  const nested = firstIndex((e) => eventDepth(e, depths) > 0);
  if (nested !== -1) {
    add(
      nested,
      "Indent is fiber depth, not identity: sibling fibers share a column.",
    );
  }

  events.forEach((event, i) => {
    if (
      event.type === "fiber:fork" &&
      event.parentId &&
      event.forkedBy &&
      event.forkedBy !== event.parentId
    ) {
      add(
        i,
        `Indented with ${event.forkedBy}, which ran the fork; ${event.fiberId} itself sits under ${event.parentId}, whose context it inherits.`,
      );
    }
  });

  const childEnd = firstIndex(
    (e) =>
      (e.type === "fiber:end" || e.type === "fiber:interrupt") &&
      (depths.get(e.fiberId) ?? 0) > 0,
  );
  if (childEnd !== -1) {
    add(childEnd, "Indented with the child: ending is its own last action.");
  }
}
