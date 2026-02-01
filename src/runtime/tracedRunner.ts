import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  FiberId,
  Layer,
} from "effect";

import { randomUUID } from "@/lib/crypto";
import type { TraceEvent } from "@/types/trace";

// =============================================================================
// TraceEmitter Service Definition
// =============================================================================

/**
 * TraceEmitter is a SERVICE that emits trace events.
 *
 * In Effect, services are defined using Context.Tag. The Tag acts as a
 * "key" to look up the service implementation at runtime.
 *
 * The type signature Effect<A, E, TraceEmitter> means:
 * - A: success type
 * - E: error type
 * - TraceEmitter: this effect REQUIRES a TraceEmitter service to run
 */
export class TraceEmitter extends Context.Tag("TraceEmitter")<
  TraceEmitter,
  {
    readonly emit: (event: TraceEvent) => Effect.Effect<void>;
  }
>() {}

// =============================================================================
// Helper Effects
// =============================================================================

/**
 * Emit an effect:start event.
 * Returns an Effect that requires TraceEmitter.
 */
export const emitStart = (
  id: string,
  label: string,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    yield* emit({
      type: "effect:start",
      id,
      label,
      timestamp: Date.now(),
    });
  });
};

/**
 * Emit an effect:end event.
 * Returns an Effect that requires TraceEmitter.
 */
export const emitEnd = (
  id: string,
  result: "success" | "failure",
  value?: unknown,
  error?: unknown,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    yield* emit({
      type: "effect:end",
      id,
      result,
      value,
      error,
      timestamp: Date.now(),
    });
  });
};

// =============================================================================
// Traced Runner
// =============================================================================

/**
 * Wrap an effect to emit trace events before and after execution.
 *
 * This returns a NEW effect that:
 * 1. Emits effect:start
 * 2. Runs the original effect
 * 3. Emits effect:end (success or failure)
 * 4. Returns the result
 *
 * Notice: The returned effect requires TraceEmitter in its R channel!
 */
export const withTrace = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string,
): Effect.Effect<A, E, R | TraceEmitter> => {
  const id = randomUUID();
  return Effect.gen(function* () {
    yield* emitStart(id, label);

    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? emitEnd(id, "success", exit.value)
          : emitEnd(id, "failure", undefined, Cause.squash(exit.cause)),
      ),
    );
  });
};

// =============================================================================
// Layer Implementation
// =============================================================================

/**
 * Create a TraceEmitter Layer that calls a callback function.
 * This bridges Effect's world with React's world.
 *
 * Usage:
 *   const layer = makeTraceEmitterLayer((event) => addEventToReactState(event));
 *   Effect.runPromise(program.pipe(Effect.provide(layer)));
 */
export const makeTraceEmitterLayer = (
  onEmit: (event: TraceEvent) => void,
): Layer.Layer<TraceEmitter> => {
  // TODO 4: Create a Layer that provides the TraceEmitter service
  //
  // Hint: Use Layer.succeed(TraceEmitter, { emit: ... })
  // Hint: The emit function should wrap onEmit in Effect.sync
  //
  // Example:
  //   Layer.succeed(TraceEmitter, {
  //     emit: (event) => Effect.sync(() => onEmit(event)),
  //   })

  return Layer.succeed(TraceEmitter, {
    emit: (event) => Effect.sync(() => onEmit(event)),
  });
};

// =============================================================================
// Fiber Tracing (using Effect's real FiberId)
// =============================================================================

/**
 * Fork an effect and emit fiber lifecycle events.
 * Uses Effect's real FiberId for accurate parent-child tracking.
 */
export const forkWithTrace = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label?: string,
): Effect.Effect<Fiber.RuntimeFiber<A, E>, never, R | TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;

    // Get the PARENT fiber ID (current fiber doing the forking)
    const parentFiberId = yield* Effect.fiberId;
    const parentId = FiberId.threadName(parentFiberId);

    // Fork the effect, wrapping it to emit end event
    const fiber = yield* Effect.fork(
      effect.pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            // Get the CHILD fiber ID (inside the forked fiber)
            const childFiberId = yield* Effect.fiberId;
            const childId = FiberId.threadName(childFiberId);

            yield* emit({
              type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
              fiberId: childId,
              timestamp: Date.now(),
            });
          }),
        ),
      ),
    );

    // Emit fork event with real fiber IDs
    const childId = FiberId.threadName(fiber.id());
    yield* emit({
      type: "fiber:fork",
      fiberId: childId,
      parentId,
      label,
      timestamp: Date.now(),
    });

    return fiber;
  });
};

/**
 * Run a program and emit fiber events for the root fiber.
 * This creates the "main" fiber that child fibers will reference as parent.
 */
export const runProgramWithTrace = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  label?: string,
): Effect.Effect<A, E, R | TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;

    // Get the root fiber ID
    const rootFiberId = yield* Effect.fiberId;
    const rootId = FiberId.threadName(rootFiberId);

    // Emit root fiber fork (no parentId = this is the root!)
    yield* emit({
      type: "fiber:fork",
      fiberId: rootId,
      label,
      timestamp: Date.now(),
    });

    // Run the program and emit end event when done
    const result = yield* program.pipe(
      Effect.onExit((exit) =>
        emit({
          type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
          fiberId: rootId,
          timestamp: Date.now(),
        }),
      ),
    );

    return result;
  });
};

// =============================================================================
// Sleep Tracing (Phase 3: Scheduling & Delays)
// =============================================================================

/**
 * Sleep with tracing - emits sleep:start and sleep:end events.
 * Makes fiber suspension visible in the visualizer.
 *
 * When a fiber sleeps, it SUSPENDS (yields control) rather than blocking.
 * This function emits events so we can visualize when fibers are suspended.
 */
export const sleepWithTrace = (
  duration: Duration.DurationInput,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    const currentFiberId = yield* Effect.fiberId;
    const fiberId = FiberId.threadName(currentFiberId);
    const durationMillis = Duration.toMillis(Duration.decode(duration));
    yield* emit({
      type: "sleep:start",
      fiberId,
      duration: durationMillis,
      timestamp: Date.now(),
    });
    yield* Effect.sleep(duration);
    yield* emit({
      type: "sleep:end",
      fiberId,
      timestamp: Date.now(),
    });
  });
};
