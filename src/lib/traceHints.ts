import type { TraceEvent } from "@/types/trace";

import { eventDepth, fiberDepths } from "./fiberDepth";

/** One explanation of a row, which may point at another row of the trace. */
export interface Hint {
  /** The text, where `[N]` stands for the number of the row `ref` points at. */
  text: string;
  /** The row `[N]` stands for. */
  ref?: {
    /** Index in the full trace of the row the text points at. */
    index: number;
    /** The text to show instead while that row is hidden. */
    whenHidden: string;
  };
}

/**
 * Explanations for trace rows that match a known runtime pattern, keyed by the
 * row's index in `events`.
 *
 * Every pattern is adjacency in trace order ("the next event", "nothing
 * between"), so this must run on the full, unfiltered trace: hiding rows in the
 * log must never change which hints fire. `indentByFiber` adds the hint that
 * explains how the indented log places rows.
 */
export function traceHints(
  events: readonly TraceEvent[],
  { indentByFiber }: { indentByFiber: boolean },
): Map<number, Hint[]> {
  const hints = new Map<number, Hint[]>();
  const add = (index: number, hint: Hint | string) => {
    const entry = typeof hint === "string" ? { text: hint } : hint;
    const row = hints.get(index);
    if (row) row.push(entry);
    else hints.set(index, [entry]);
  };

  const parentOf = new Map<string, string>();
  const firstResume = new Map<string, number>();
  events.forEach((event, i) => {
    if (event.type === "fiber:fork" && event.parentId) {
      parentOf.set(event.fiberId, event.parentId);
    }
    if (event.type === "fiber:resume" && !firstResume.has(event.fiberId)) {
      firstResume.set(event.fiberId, i);
    }
  });

  // Both hold the state before the row being read.
  const lastLifecycle = new Map<string, TraceEvent>();
  const lastSuspend = new Map<string, TraceEvent>();

  /**
   * Whether the resume at `i` is the runtime running the next fiber in its
   * queue because the one before gave up the thread. A fiber whose own wait
   * ended long ago woke on its own timer instead, merely after the other's
   * suspend.
   */
  const isQueueHandoff = (i: number) => {
    const prev = events[i - 1];
    const event = events[i];
    if (
      prev?.type !== "fiber:suspend" ||
      event?.type !== "fiber:resume" ||
      event.fiberId === prev.fiberId ||
      !sameInstant(event.timestamp, prev.timestamp)
    ) {
      return false;
    }
    const own = lastSuspend.get(event.fiberId);
    return own === undefined || sameInstant(own.timestamp, event.timestamp);
  };

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
      case "fiber:fork": {
        const parent = event.parentId;
        if (!parent) break;
        if (
          prev?.type === "fiber:end" &&
          parentOf.get(prev.fiberId) === parent &&
          lastLifecycle.get(parent)?.type === "fiber:suspend"
        ) {
          add(
            i,
            `${prev.fiberId} ending started the next task; ${parent} stays parked.`,
          );
        }
        const runsAt = firstResume.get(event.fiberId);
        if (runsAt === undefined || runsAt === i + 1) break;
        const before = events[runsAt - 1];
        const once = `once ${before.fiberId} ${before.type === "fiber:end" ? "ends" : "yields"}.`;
        add(i, {
          text: `The fork only queues ${event.fiberId}: it first runs at [N], ${once}`,
          ref: {
            index: runsAt,
            whenHidden: `The fork only queues ${event.fiberId}: it first runs ${once}`,
          },
        });
        break;
      }
      case "fiber:suspend": {
        if (
          next?.type === "fiber:resume" &&
          next.fiberId === event.fiberId &&
          sameInstant(next.timestamp, event.timestamp)
        ) {
          add(i, {
            text: "The fiber gave up the thread and got it back at [N], in the same instant: nothing else was ready to run.",
            ref: {
              index: i + 1,
              whenHidden:
                "The fiber gave up the thread and got it back in the same instant: nothing else was ready to run.",
            },
          });
        } else if (!isQueueHandoff(i + 1)) {
          add(i, "Async boundary: the fiber parks and frees the thread.");
        }
        break;
      }
      case "fiber:resume": {
        const waited = lastSuspend.has(event.fiberId);
        if (prev?.type === "fiber:fork" && prev.fiberId === event.fiberId) {
          add(
            i,
            `${event.fiberId} runs at once: this fork starts the child itself instead of queuing it.`,
          );
        } else if (isQueueHandoff(i)) {
          add(
            i,
            `${prev.fiberId} gave up the thread, so the runtime ran ${event.fiberId}, first in the queue.`,
          );
        } else if (
          waited &&
          prev?.type === "fiber:end" &&
          sameInstant(prev.timestamp, event.timestamp)
        ) {
          // The joiner's callback resumes it inside the end, with no scheduler
          // task between the two.
          add(
            i,
            `${prev.fiberId}'s end resumed ${event.fiberId}, which was waiting on it.`,
          );
        } else if (
          waited &&
          !(
            prev?.type === "fiber:suspend" &&
            prev.fiberId === event.fiberId &&
            sameInstant(prev.timestamp, event.timestamp)
          )
        ) {
          // A resume in the same instant as its own suspend is explained there.
          add(i, "Time the fiber spent parked.");
        }
        break;
      }
      case "fiber:interrupt": {
        const parent = parentOf.get(event.fiberId);
        if (!parent || lastLifecycle.get(parent)?.type !== "fiber:resume") {
          break;
        }
        const parentNext = events.find(
          (other, j) => j > i && other.fiberId === parent,
        );
        if (!parentNext) break;
        add(
          i,
          parentNext.type === "fiber:end" ||
            parentNext.type === "fiber:interrupt"
            ? `${event.fiberId} is interrupted before ${parent} ends.`
            : `${parent} interrupts its child ${event.fiberId} before moving on.`,
        );
        break;
      }
      case "effect:end": {
        if (event.result === "interrupted") {
          const unwound = unwinding(events, i, event.fiberId);
          if (unwound === undefined) break;
          const closed =
            "The runtime closed this span with an interruption: it neither succeeded nor failed.";
          add(
            i,
            unwound.interrupted
              ? {
                  text: `${closed} Its fiber ${event.fiberId} is interrupted at [N].`,
                  ref: {
                    index: unwound.index,
                    whenHidden: `${closed} Its fiber ${event.fiberId} is interrupted.`,
                  },
                }
              : `${closed} The fiber caught it and carries on.`,
          );
        } else if (event.result === "failure") {
          const after = events.find(
            (other, j) =>
              j > i &&
              other.fiberId === event.fiberId &&
              other.type !== "finalizer",
          );
          if (after && !failsOn(after)) {
            add(i, "The failure was handled: the fiber carries on.");
          }
        }
        break;
      }
      case "finalizer":
        if (inFinalizerRun(i)) {
          add(i, "Finalizers run in reverse order of registration.");
        } else if (unwinding(events, i, event.fiberId)?.interrupted) {
          add(i, "Interruption still closes the scope, so the finalizer runs.");
        }
        break;
      case "retry:attempt":
        if (prev?.type === "fiber:resume" && prev.fiberId === event.fiberId) {
          add(i, "The schedule's delay is over: the next attempt starts here.");
        }
        break;
    }

    if (isLifecycle(event)) lastLifecycle.set(event.fiberId, event);
    if (event.type === "fiber:suspend") lastSuspend.set(event.fiberId, event);
  });

  if (indentByFiber) {
    const depths = fiberDepths(events);
    const nested = events.findIndex((e) => eventDepth(e, depths) > 0);
    if (nested !== -1) {
      add(
        nested,
        "Indent is fiber depth, not identity: sibling fibers share a column.",
      );
    }
  }

  return hints;
}

/**
 * A row's hints as one text, each `[N]` replaced by the number `rowNumber`
 * gives the row it points at, or the hint's hidden variant when it gives none.
 */
export function hintText(
  hints: readonly Hint[],
  rowNumber: (index: number) => number | undefined,
): string {
  return hints
    .map(({ text, ref }) => {
      if (!ref) return text;
      const number = rowNumber(ref.index);
      return number === undefined
        ? ref.whenHidden
        : text.replace("[N]", `[${number}]`);
    })
    .join(" ");
}

/**
 * Events stamped closer than this belong to one synchronous burst of the
 * runtime. Virtual time runs on with wall time (runtime/virtualClock.ts) and
 * the tracer, fiber lifecycle observer and runner each read it themselves, so a
 * burst spans a few milliseconds and span stamps can be a millisecond early.
 * Speed never exceeds 1, so a burst is no wider in virtual time; a shorter
 * sleep reads as instant.
 */
const SAME_INSTANT_MS = 10;

/** Whether two timestamps belong to one synchronous burst of the runtime. */
export function sameInstant(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_INSTANT_MS;
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

/** Whether a fiber's event shows a failure or interruption still on its way out. */
function failsOn(event: TraceEvent): boolean {
  return (
    (event.type === "effect:end" && event.result !== "success") ||
    event.type === "fiber:interrupt" ||
    (event.type === "fiber:end" && event.result === "failure")
  );
}

/**
 * Where the fiber goes after `from`, past the span ends and finalizers that
 * unwind it: to its interrupt at `index`, or on with other work. An interrupted
 * fiber runs nothing but that unwinding before it reports the interrupt, so the
 * order is enough; timestamps are not, since a slow machine stretches the
 * unwinding well past `SAME_INSTANT_MS`. `undefined` while the trace has
 * nothing after it yet.
 */
function unwinding(
  events: readonly TraceEvent[],
  from: number,
  fiberId: string,
): { interrupted: boolean; index: number } | undefined {
  for (let j = from + 1; j < events.length; j++) {
    const event = events[j];
    if (event.fiberId !== fiberId) continue;
    if (event.type === "effect:end" || event.type === "finalizer") continue;
    return { interrupted: event.type === "fiber:interrupt", index: j };
  }
  return undefined;
}
