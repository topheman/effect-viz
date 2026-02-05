import { Context, Effect } from "effect";

import type { TraceEvent } from "@/types/trace";

// =============================================================================
// TraceEmitter Service Definition
// =============================================================================

export class TraceEmitter extends Context.Tag("TraceEmitter")<
  TraceEmitter,
  {
    readonly emit: (event: TraceEvent) => Effect.Effect<void>;
  }
>() {}

// =============================================================================
// Helper Effects
// =============================================================================

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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
    });
  });
};
