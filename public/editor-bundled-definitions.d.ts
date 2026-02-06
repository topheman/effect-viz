/**
 * Minimal type definitions for the program editor.
 * Contains stubs for:
 * - effect (Effect, Fiber, Exit, Context, etc.) so the editor shows type hints
 *   without pulling in the full Effect typings
 * - @/runtime/tracedRunner (withTrace, forkWithTrace, runProgramWithTrace, etc.)
 * - @/lib/crypto (randomUUID)
 * - @/runtime/traceEmitter (TraceEmitter, emitStart, emitEnd, etc.)
 * - @/types/trace (TraceEvent, FiberInfo, type guards, etc.)
 *
 * When this file is in src/types it is used by the app typecheck; move it
 * elsewhere (e.g. editor-only) to use real Effect types in development.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- type params kept for API surface */
/* eslint-disable @typescript-eslint/no-empty-object-type -- minimal declaration stubs */

// -----------------------------------------------------------------------------
// Effect module
// -----------------------------------------------------------------------------

declare module "effect" {
  // --- Effect type and namespace (merge so Effect.Effect<A,E,R> and Effect.gen both work)

  export namespace Effect {
    /** Wrapper for the value yielded when you yield* an effect; used for infer/conditional in gen. */
    export interface YieldWrap<T> {
      readonly _: T;
    }

    /** Resume adapter passed to the generator (e.g. pipe); minimal for editor stub. */
    export interface Adapter {
      <A, E, R>(self: Effect<A, E, R>): Effect<A, E, R>;
    }

    export interface Effect<A, E = unknown, R = never> {
      pipe<B, E2, R2>(
        ...fns: Array<(self: Effect<A, E, R>) => Effect<B, E2, R2>>
      ): Effect<B, E2, R | R2>;
      [Symbol.iterator](): Iterator<YieldWrap<Effect<A, E, R>>, A, unknown>;
    }

    /**
     * Effect.gen type inference (how E and R "bubble up" from yield*):
     *
     * 1. Each effect has [Symbol.iterator]() that yields YieldWrap<Effect<A,E,R>> once.
     * 2. The generator's yield type Eff is inferred as the union of all yielded types:
     *    Eff = YieldWrap<Effect<A1,E1,R1>> | YieldWrap<Effect<A2,E2,R2>> | ...
     * 3. Conditional types below extract E and R from Eff. They distribute over unions, so:
     *    E = E1 | E2 | ...,  R = R1 | R2 | ...
     * 4. Result type is Effect<AEff, E, R> with AEff = generator return type.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint must match any Effect for infer
    export function gen<Eff extends YieldWrap<Effect<any, any, any>>, AEff>(
      f: (resume: Adapter) => Generator<Eff, AEff, never>,
    ): Effect<
      AEff,
      [Eff] extends [never]
        ? never
        : [Eff] extends [YieldWrap<Effect<infer _A, infer E, infer _R>>]
          ? E
          : never,
      [Eff] extends [never]
        ? never
        : [Eff] extends [YieldWrap<Effect<infer _A, infer _E, infer R>>]
          ? R
          : never
    >;
    export function sync<A>(fn: () => A): Effect<A, never, never>;
    export function succeed<A>(value: A): Effect<A, never, never>;
    export function fail<E>(error: E): Effect<never, E, never>;
    export function as<B>(
      value: B,
    ): <A, E, R>(self: Effect<A, E, R>) => Effect<B, E, R>;
    export function race<A, E, R>(
      self: Effect<A, E, R>,
      that: Effect<A, E, R>,
    ): Effect<A, E, R>;
    export function catchAll<E, A2, E2, R2>(
      f: (e: E) => Effect<A2, E2, R2>,
    ): <A, R>(self: Effect<A, E, R>) => Effect<A2, E2, R | R2>;
    export function scoped<A, E, R>(effect: Effect<A, E, R>): Effect<A, E, R>;
    export function pipe<A, B, E2, R2>(
      value: Effect<A, unknown, unknown>,
      ...fns: Array<(self: Effect<A, unknown, unknown>) => Effect<B, E2, R2>>
    ): Effect<B, E2, R2>;
    export function onExit<A, E, R, A2, E2, R2>(
      f: (exit: Exit.Exit<A, E>) => Effect<A2, E2, R2>,
    ): (self: Effect<A, E, R>) => Effect<A, E, R | R2>;
    export function fork<A, E, R>(
      effect: Effect<A, E, R>,
    ): Effect<Fiber.RuntimeFiber<A, E>, never, R>;
    export const fiberId: Effect<FiberId.FiberId, never, never>;
    export function exit<A, E, R>(
      effect: Effect<A, E, R>,
    ): Effect<Exit.Exit<A, E>, never, R>;
    export function sleep(
      duration: Duration.DurationInput,
    ): Effect<void, never, never>;
    export function addFinalizer<R>(
      finalizer: (exit: Exit.Exit<unknown, unknown>) => Effect<void, never, R>,
    ): Effect<void, never, Scope.Scope | R>;
    export function asVoid<A, E, R>(
      effect: Effect<A, E, R>,
    ): Effect<void, E, R>;
    export function runFork<A, E, R>(
      effect: Effect<A, E, R>,
    ): Fiber.RuntimeFiber<A, E>;
    export function provide<R, E, A>(
      layer: Layer.Layer<R>,
    ): (self: Effect<A, E, R>) => Effect<A, E, never>;
    export function runPromise<A, E>(effect: Effect<A, E, never>): Promise<A>;
  }

  export type Effect<A, E = unknown, R = never> = Effect.Effect<A, E, R>;

  export declare const Effect: Effect;

  // --- Exit (tracedRunner, traceEmitter)
  export namespace Exit {
    export interface Exit<A, E> {
      readonly _tag: "Success" | "Failure";
      value?: A;
      cause?: unknown;
    }
    export function isSuccess<A, E>(
      exit: Exit<A, E>,
    ): exit is Exit<A, E> & { value: A };
  }

  // --- Cause (tracedRunner)
  export namespace Cause {
    export type Cause<E> = unknown;
    export const squash: <E>(self: Cause<E>) => unknown;
  }

  // --- Duration (tracedRunner)
  export namespace Duration {
    export type DurationInput = string | number;
    export function decode(input: DurationInput): unknown;
    export function toMillis(duration: unknown): number;
  }

  // --- FiberId (tracedRunner)
  export namespace FiberId {
    export interface FiberId {}
    export function threadName(fiberId: FiberId): string;
  }

  // --- Fiber
  export namespace Fiber {
    export interface RuntimeFiber<A, E> {
      id(): FiberId.FiberId;
      join(): Effect<A, E, never>;
      interrupt(): Effect<void, never, never>;
    }
    export function join<A, E>(fiber: RuntimeFiber<A, E>): Effect<A, E, never>;
    export function interrupt<A, E>(
      fiber: RuntimeFiber<A, E>,
    ): Effect<void, never, never>;
  }

  export declare const Fiber: Fiber;

  // --- Ref
  export interface Ref<A> {}

  export const Ref: {
    make<A>(value: A): Effect<Ref<A>, never, never>;
    updateAndGet<A>(ref: Ref<A>, f: (a: A) => A): Effect<A, never, never>;
  };

  // --- Layer (tracedRunner, useEventHandlers)
  export namespace Layer {
    export interface Layer<R> {}
    export function succeed<R, E, A>(tag: Context.Tag<R, A>, impl: A): Layer<R>;
  }

  // --- Scope (tracedRunner; value export so not type-only under verbatimModuleSyntax)
  export namespace Scope {
    export interface Scope {}
    export declare const Scope: Scope;
  }

  // --- Context (traceEmitter): Tag("N")<T,S>() is the class to extend; constructor is iterable for yield* Tag
  export namespace Context {
    /** Tag (the class) carries service type A so Layer.succeed(tag, impl) infers impl: A */
    export type Tag<R, A> = (new () => TagInstance<A>) & {
      [Symbol.iterator](): Iterator<
        Effect<unknown, unknown, unknown>,
        A,
        unknown
      >;
    };
    export interface TagInstance<A> {}
    export function Tag<N extends string>(
      _n: N,
    ): <T, S>() => (new () => TagInstance<S>) & {
      [Symbol.iterator](): Iterator<
        Effect<unknown, unknown, unknown>,
        S,
        unknown
      >;
    };
  }

  // --- Schema (useOnboarding); Schema.Schema.Type<typeof x> pattern
  export namespace Schema {
    export interface Schema<A> {}
    export namespace Schema {
      export type Type<S> = S extends Schema<infer A> ? A : never;
    }
    export type Type<S> = S extends Schema<infer A> ? A : never;
    export function Literal<const A extends string>(
      ...values: readonly A[]
    ): Schema<A>;
    export function Struct<O extends Record<string, Schema<unknown>>>(
      fields: O,
    ): Schema<{ [K in keyof O]: Type<O[K]> }>;
    export const Number: Schema<number>;
    export const String: Schema<string>;
    export function decodeUnknownSync<A>(schema: Schema<A>): (u: unknown) => A;
  }

  export declare const Schema: Schema;
}

// -----------------------------------------------------------------------------
// Traced runner
// -----------------------------------------------------------------------------

declare module "@/runtime/tracedRunner" {
  import type { Effect } from "effect";

  import type { TraceEvent } from "@/types/trace";

  export function withTrace<A, E, R>(
    effect: Effect<A, E, R>,
    label: string,
  ): Effect.Effect<A, E, R | import("@/runtime/traceEmitter").TraceEmitter>;

  export function forkWithTrace<A, E, R>(
    effect: Effect<A, E, R>,
    label: string,
  ): Effect.Effect<
    import("effect").Fiber.RuntimeFiber<A, E>,
    never,
    R | import("@/runtime/traceEmitter").TraceEmitter
  >;

  export function runProgramWithTrace<A, E, R>(
    program: Effect<A, E, R>,
    label: string,
  ): Effect<A, E, R | import("@/runtime/traceEmitter").TraceEmitter>;

  export function makeTraceEmitterLayer(
    onEmit: (event: TraceEvent) => void,
  ): import("effect").Layer.Layer<
    import("@/runtime/traceEmitter").TraceEmitter
  >;

  export function sleepWithTrace(
    duration: string,
  ): Effect<void, never, import("@/runtime/traceEmitter").TraceEmitter>;

  export function retryWithTrace<A, E, R>(
    effect: Effect<A, E, R>,
    options: { maxRetries: number; label: string },
  ): Effect<
    A,
    import("effect").Cause.Cause<E>,
    R | import("@/runtime/traceEmitter").TraceEmitter
  >;

  export function addFinalizerWithTrace<R>(
    finalizer: (exit: unknown) => Effect<void, never, R>,
    label: string,
  ): Effect<
    void,
    never,
    | import("@/runtime/traceEmitter").TraceEmitter
    | import("effect").Scope.Scope
    | R
  >;

  export function acquireReleaseWithTrace<A, E, R, R2>(
    acquire: Effect<A, E, R>,
    release: (a: A, exit: unknown) => Effect<void, never, R2>,
    label: string,
  ): Effect<
    A,
    E,
    | import("@/runtime/traceEmitter").TraceEmitter
    | import("effect").Scope.Scope
    | R
    | R2
  >;
}

// -----------------------------------------------------------------------------
// Crypto
// -----------------------------------------------------------------------------

declare module "@/lib/crypto" {
  /** Generate a UUID v4. */
  export function randomUUID(): string;
}

// -----------------------------------------------------------------------------
// Trace emitter
// -----------------------------------------------------------------------------

declare module "@/runtime/traceEmitter" {
  import type { Context, Effect } from "effect";

  import type { TraceEvent } from "@/types/trace";

  export class TraceEmitter extends Context.Tag("TraceEmitter")<
    TraceEmitter,
    { readonly emit: (event: TraceEvent) => Effect.Effect<void> }
  > {}

  export function emitStart(
    id: string,
    label: string,
  ): Effect.Effect<void, never, TraceEmitter>;

  export function emitEnd(
    id: string,
    result: "success" | "failure",
    value?: unknown,
    error?: unknown,
  ): Effect.Effect<void, never, TraceEmitter>;

  export function emitRetry(
    id: string,
    label: string,
    attempt: number,
    lastError: unknown,
  ): Effect.Effect<void, never, TraceEmitter>;

  export function emitFinalizer(
    id: string,
    label: string,
  ): Effect.Effect<void, never, TraceEmitter>;

  export function emitAcquire(
    id: string,
    label: string,
    result: "success" | "failure",
    error?: unknown,
  ): Effect.Effect<void, never, TraceEmitter>;
}

// -----------------------------------------------------------------------------
// Trace types
// -----------------------------------------------------------------------------

declare module "@/types/trace" {
  export interface EffectStartEvent {
    type: "effect:start";
    id: string;
    label: string;
    timestamp: number;
  }

  export type EffectEndEvent =
    | {
        type: "effect:end";
        id: string;
        result: "success";
        timestamp: number;
        value: unknown;
      }
    | {
        type: "effect:end";
        id: string;
        result: "failure";
        timestamp: number;
        error: unknown;
      };

  export interface RetryAttemptEvent {
    type: "retry:attempt";
    id: string;
    label: string;
    attempt: number;
    lastError: unknown;
    timestamp: number;
  }

  export interface FiberForkEvent {
    type: "fiber:fork";
    fiberId: string;
    parentId?: string;
    label: string;
    timestamp: number;
  }

  export interface FiberEndEvent {
    type: "fiber:end";
    fiberId: string;
    timestamp: number;
  }

  export interface FiberInterruptEvent {
    type: "fiber:interrupt";
    fiberId: string;
    timestamp: number;
  }

  export interface SleepStartEvent {
    type: "sleep:start";
    fiberId: string;
    duration: number;
    timestamp: number;
  }

  export interface SleepEndEvent {
    type: "sleep:end";
    fiberId: string;
    timestamp: number;
  }

  export interface FinalizerEvent {
    type: "finalizer";
    id: string;
    label: string;
    timestamp: number;
  }

  type AcquireEvent =
    | {
        type: "acquire";
        result: "success";
        id: string;
        label: string;
        timestamp: number;
      }
    | {
        type: "acquire";
        result: "failure";
        id: string;
        label: string;
        error: unknown;
        timestamp: number;
      };

  export type TraceEvent =
    | EffectStartEvent
    | EffectEndEvent
    | FiberForkEvent
    | FiberEndEvent
    | FiberInterruptEvent
    | SleepStartEvent
    | SleepEndEvent
    | RetryAttemptEvent
    | FinalizerEvent
    | AcquireEvent;

  export function isEffectEvent(
    event: TraceEvent,
  ): event is EffectStartEvent | EffectEndEvent;

  export function isFiberEvent(
    event: TraceEvent,
  ): event is FiberForkEvent | FiberEndEvent | FiberInterruptEvent;

  export function isSleepEvent(
    event: TraceEvent,
  ): event is SleepStartEvent | SleepEndEvent;

  export type FiberState =
    | "running"
    | "suspended"
    | "completed"
    | "interrupted";

  export interface FiberInfo {
    id: string;
    parentId?: string;
    state: FiberState;
    label?: string;
    startTime: number;
    endTime?: number;
    children: string[];
  }
}
