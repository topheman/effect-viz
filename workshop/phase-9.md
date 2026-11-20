# Phase 9: retry with Schedule API

## Concepts

### Schedule-Based Retry

Effect's `Effect.retry(effect, schedule)` uses a **Schedule** to control retry policy: how many times to retry, delays between attempts, and when to stop. The Schedule consumes the error and decides whether to continue (with optional delay) or stop.

### Stepping through the schedule by hand

`Schedule.toStepWithSleep(schedule)` turns the schedule into a step function that we call ourselves. We use a loop instead of `Effect.retry` so we can emit `retry:attempt` after each failure before retrying. The step takes the error, sleeps for the delay the schedule computed and returns its output, or fails once the schedule is done. It sleeps even when the delay is zero, as with `Schedule.recurs`, so each retry shows a suspend with a 0 ms sleep as its reason (see [effect-4-migration.md](./effect-4-migration.md#retries)).

### Same API as Effect.retry

`retry(effect, schedule, label)` mirrors `Effect.retry(effect, schedule)` — schedule as second argument, with our `label` as third for tracing.

### Public vs Private Runtime Exports

**Public APIs** match Effect's naming so programs feel native: `retry`, `addFinalizer`, `acquireRelease`.

**Private APIs** (EffectViz internals: trace emitter, viz layers, tracer, runProgramFork) are prefixed with `_` so they don't clash with user imports from `@/runtime`.

## Implementation

### Created/Modified Files

| File                          | Changes                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/tracedRunner.ts` | `retryWithTrace(effect, schedule, label)`; `Schedule.toStepWithSleep` + loop; `emitStart`/`emitEnd`/`emitRetry` share one id                |
| `src/runtime/index.ts`        | Export `retryWithTrace as retry` so programs use plain `retry`                                                                              |
| `src/lib/programs.ts`         | `retry(flakyEffect, Schedule.recurs(3), "flaky-task")`; backoff with `Schedule.exponential("100 millis")` and `Schedule.upTo({ times: 5 })` |

### Key Function

```typescript
// tracedRunner.ts (exported as retry from @/runtime)
export function retryWithTrace<A, E, R, X, R2>(
  effect: Effect.Effect<A, E, R>,
  schedule: Schedule.Schedule<X, E, R2>,
  label: string,
): Effect.Effect<A, Cause.Cause<E>, R | R2 | TraceEmitter>
```

### Flow

1. Run effect
2. On success: emit `effect:end`, return
3. On failure: `step(error)` — if it succeeds (the schedule continues), emit `retry:attempt` and loop; if it fails (the schedule is done), emit `effect:end` (failure) and fail

## Key Learnings

### Schedule Consumes the Error

The Schedule type is `Schedule<Out, In, R>`. For retry, `In` is the error type `E`. Each failure is fed to `step(error)`; the schedule decides whether to continue or stop.

### Keep TraceEmitter for Span Association

We keep `emitStart`, `emitEnd`, and `emitRetry` so all share the same `id`. This ensures `retry:attempt` stays correctly associated with the retry span in the ExecutionLog.

### Built-in Schedules

- `Schedule.recurs(n)` — recurs `n` times (equivalent to `n` retries)
- `Schedule.exponential(base)` — delays that double from `base`, forever; `"100 millis"` keeps them visible on the timeline
- `Schedule.upTo({ times: n })` — stops a schedule after `n` recurrences

## Example Programs

- **Retry** (`retry`): Ref-backed effect that fails on attempts 1 and 2, succeeds on 3; `retry(flakyEffect, Schedule.recurs(3), "flaky-task")` — two `retry:attempt` lines then `effect:end` success.
- **Retry (Exponential Backoff)** (`retryExponentialBackoff`): Fails four times, then succeeds, under `Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 5 }))` — 100ms, 200ms, 400ms, 800ms between attempts; the timeline shows `fiber:suspend` during the delays.

## What's Next

Phase 9 completes the retry refactor. Future phases may explore the acquire/finalizer refactor (Effect.withSpan for acquire) or additional Schedule patterns (jitter).
