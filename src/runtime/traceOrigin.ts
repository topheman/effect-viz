/**
 * Tags each trace event with who caused it: the program, or the visualizer.
 *
 * Only one thing in a run is ever the visualizer's. Starting paused injects an
 * `Effect.yieldNow()` before the program body, and the runtime yields for real,
 * so the trace gains a `fiber:suspend` and `fiber:resume` pair that the
 * program's author never wrote. A run started with Play has no injection, so
 * nothing is tagged. See `workshop/phase-10.md`.
 *
 * That pair cannot be recognised by its contents, because an injected yield
 * emits exactly what an earned one does. It is recognised by position: it is the
 * first thing the root fiber does, because that is where we put it.
 */
import type { TraceEvent } from "@/types/trace";

/** Events with no origin are the program's, so only an explicit tag hides one. */
export function isToolEvent(event: TraceEvent): boolean {
  return event.origin === "tool";
}

/**
 * The fiber that *acted*, or null for events that name no fiber.
 *
 * A fork names the fiber being created, not the one doing the forking, so its
 * parent is the actor.
 */
function actingFiberId(event: TraceEvent): string | null {
  if (event.type === "fiber:fork") return event.parentId ?? null;
  return "fiberId" in event ? event.fiberId : null;
}

/** Which part of the injected yield is still to come. */
type Phase =
  /** Nothing seen yet. The run opens with the root's fork, which names the fiber to watch. */
  | "awaiting-fork"
  /** The root is known, and its next act should be the injected yield suspending it. */
  | "awaiting-suspend"
  /** The yield has suspended. Its matching resume, once the first step releases it, closes the pair. */
  | "awaiting-resume"
  /** Nothing left to look for: both tagged, the search abandoned, or the run started with Play. */
  | "done";

export interface OriginTaggerOptions {
  /** Whether the run was started paused, which is the only source of injection. */
  readonly startPaused: boolean;
}

/**
 * Returns the tagger for one run. Call it on every event in order; it gives back
 * the event marked as the tool's, or unchanged. It holds that run's state, so a
 * new run needs a new tagger.
 */
export function makeOriginTagger({
  startPaused,
}: OriginTaggerOptions): (event: TraceEvent) => TraceEvent {
  let phase: Phase = startPaused ? "awaiting-fork" : "done";
  let rootFiberId: string | null = null;

  const tool = (event: TraceEvent): TraceEvent => ({
    ...event,
    origin: "tool",
  });

  return (event) => {
    if (phase === "done") return event;

    if (phase === "awaiting-fork") {
      // The root's fork opens every run, and its id is what identifies the pair:
      // it has to be read rather than hardcoded, because the two runtimes number
      // fibers differently. Anything else first means this is not the run we
      // expect, and the next fork would be a child rather than the root.
      if (event.type !== "fiber:fork") {
        phase = "done";
        return event;
      }
      rootFiberId = event.fiberId;
      phase = "awaiting-suspend";
      return event;
    }

    // Only the root can settle this. Another fiber's events say nothing either
    // way; events naming no fiber — a span opening, a finalizer — mean the
    // program is already working, so they fall through and end the search.
    const actor = actingFiberId(event);
    if (actor !== null && actor !== rootFiberId) return event;

    if (phase === "awaiting-suspend" && event.type === "fiber:suspend") {
      phase = "awaiting-resume";
      return tool(event);
    }
    if (phase === "awaiting-resume" && event.type === "fiber:resume") {
      phase = "done";
      return tool(event);
    }

    // The root did something else, so the injected yield is no longer the
    // explanation for what follows. Stop looking, rather than risk tagging a
    // suspend the program earned.
    phase = "done";
    return event;
  };
}
