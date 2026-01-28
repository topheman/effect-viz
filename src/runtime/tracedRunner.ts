import { Cause, Context, Effect, Exit, Layer } from "effect";

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
  const id = crypto.randomUUID();
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
