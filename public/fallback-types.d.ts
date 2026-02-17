/**
 * Minimal Effect type stubs for the Monaco editor (mobile fallback path).
 * Used when WebContainer cannot boot (e.g. on mobile devices).
 *
 * Contains only the "effect" module declaration. All tracedRunner-related types
 * (tracedRunner, traceEmitter, crypto, trace) come from public/app/ (built by
 * npm run build:tracedrunner).
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- type params kept for API surface */
/* eslint-disable @typescript-eslint/no-empty-object-type -- minimal declaration stubs */

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
      /**
       * Single-step pipe: result has the transformed effect's requirements (e.g. provide removes them).
       * We do not support all overloads from https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Pipeable.ts
       */
      pipe<B, E2, R2>(
        fn: (self: Effect<A, E, R>) => Effect<B, E2, R2>,
      ): Effect<B, E2, R2>;
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
    /**
     * Single-step pipe so that e.g. Effect.provide(layer) correctly narrows requirements to Exclude<R, ROut>.
     * We do not support all overloads from https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Pipeable.ts
     */
    export function pipe<A, B, E, E2, R, R2>(
      value: Effect<A, E, R>,
      fn: (self: Effect<A, E, R>) => Effect<B, E2, R2>,
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
    /** Providing a layer that outputs ROut removes ROut from the effect's requirements. */
    export function provide<ROut>(
      layer: Layer.Layer<ROut>,
    ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, ROut>>;
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
