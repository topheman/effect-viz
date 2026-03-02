/**
 * Run a program with Effect.runFork, emit root fiber events, and return
 * a promise that resolves when the fiber completes.
 *
 * DRY helper used by useEventHandlers (fallback) and WebContainer RUNNER_JS.
 */
import { Effect, Fiber, FiberId } from "effect";

import type { TraceEvent } from "@/types/trace";

export interface RunProgramForkResult<A> {
  /** The forked fiber (for interrupt) */
  fiber: Fiber.RuntimeFiber<A, unknown>;
  /** Resolves with result on success, rejects on failure. Emits fiber:end/fiber:interrupt. */
  promise: Promise<A>;
}

/**
 * Forks a program with Effect.runFork, emits the root fiber:fork via updateRefs,
 * and returns the fiber plus a promise that emits fiber:end or fiber:interrupt on completion.
 */
export function runProgramFork<A>(
  program: Effect.Effect<A, unknown, never>,
  onEmit: (event: TraceEvent) => void,
): RunProgramForkResult<A> {
  const fiber = Effect.runFork(program, {
    updateRefs(refs, fiberId) {
      const fiberIdString = FiberId.threadName(fiberId);
      onEmit({
        type: "fiber:fork",
        fiberId: fiberIdString,
        parentId: undefined,
        label: fiberIdString,
        timestamp: Date.now(),
      });
      return refs;
    },
  });

  const promise = Effect.runPromise(Fiber.join(fiber)).then(
    (result) => {
      onEmit({
        type: "fiber:end",
        fiberId: FiberId.threadName(fiber.id()),
        timestamp: Date.now(),
      });
      return result;
    },
    (error) => {
      onEmit({
        type: "fiber:interrupt",
        fiberId: FiberId.threadName(fiber.id()),
        timestamp: Date.now(),
      });
      throw error;
    },
  );

  return { fiber, promise };
}
