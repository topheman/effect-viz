import { Clock, Context, Effect } from "effect";

import type { TraceEvent } from "@/types/trace";

/**
 * Timestamps come from `Clock.currentTimeMillis`, not `Date.now()`, so they are
 * expressed in virtual time: a recorded trace spans the same duration whatever
 * speed it was captured at. `Clock` is a default service, so this adds nothing
 * to the R channel.
 */
export class TraceEmitter extends Context.Tag("TraceEmitter")<
  TraceEmitter,
  {
    readonly emit: (event: TraceEvent) => Effect.Effect<void>;
  }
>() {}

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
      timestamp: yield* Clock.currentTimeMillis,
    });
  });
};

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
      timestamp: yield* Clock.currentTimeMillis,
    });
  });
};

export const emitRetry = (
  id: string,
  label: string,
  attempt: number,
  lastError: unknown,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    yield* emit({
      type: "retry:attempt",
      id,
      label,
      attempt,
      lastError,
      timestamp: yield* Clock.currentTimeMillis,
    });
  });
};

export const emitFinalizer = (
  id: string,
  label: string,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    yield* emit({
      type: "finalizer",
      id,
      label,
      timestamp: yield* Clock.currentTimeMillis,
    });
  });
};

export const emitAcquire = (
  id: string,
  label: string,
  result: "success" | "failure",
  error?: unknown,
): Effect.Effect<void, never, TraceEmitter> => {
  return Effect.gen(function* () {
    const { emit } = yield* TraceEmitter;
    yield* emit({
      type: "acquire",
      id,
      label,
      result,
      error,
      timestamp: yield* Clock.currentTimeMillis,
    });
  });
};
