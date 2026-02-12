import { Context, Effect } from "effect";

import type { TraceEvent } from "@/types/trace";
declare const TraceEmitter_base: Context.TagClass<
  TraceEmitter,
  "TraceEmitter",
  {
    readonly emit: (event: TraceEvent) => Effect.Effect<void>;
  }
>;
export declare class TraceEmitter extends TraceEmitter_base {}
export declare const emitStart: (
  id: string,
  label: string,
) => Effect.Effect<void, never, TraceEmitter>;
export declare const emitEnd: (
  id: string,
  result: "success" | "failure",
  value?: unknown,
  error?: unknown,
) => Effect.Effect<void, never, TraceEmitter>;
export declare const emitRetry: (
  id: string,
  label: string,
  attempt: number,
  lastError: unknown,
) => Effect.Effect<void, never, TraceEmitter>;
export declare const emitFinalizer: (
  id: string,
  label: string,
) => Effect.Effect<void, never, TraceEmitter>;
export declare const emitAcquire: (
  id: string,
  label: string,
  result: "success" | "failure",
  error?: unknown,
) => Effect.Effect<void, never, TraceEmitter>;
export {};
