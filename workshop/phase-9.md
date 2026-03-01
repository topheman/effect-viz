# Phase 9: retry with Schedule API

## Concepts

### Schedule-Based Retry

Effect's `Effect.retry(effect, schedule)` uses a **Schedule** to control retry policy: how many times to retry, delays between attempts, and when to stop. The Schedule consumes the error and decides whether to continue (with optional delay) or stop.

### Schedule.driver for Manual Control

`Schedule.driver(schedule)` returns a driver that lets us step through the schedule manually. We use a loop instead of `Effect.retry` so we can emit `retry:attempt` after each failure before retrying. The driver's `next(error)` returns an Effect that sleeps for the schedule's delay (if any) and yields the next output, or fails when the schedule is exhausted.

### Same API as Effect.retry

`retry(effect, schedule, label)` mirrors `Effect.retry(effect, schedule)` — schedule as second argument, with our `label` as third for tracing.

### Public vs Private Runtime Exports

**Public APIs** match Effect's naming so programs feel native: `retry`, `addFinalizer`, `acquireRelease`.

**Private APIs** (EffectViz internals: trace emitter, viz layers, tracer, runProgramFork) are prefixed with `_` so they don't clash with user imports from `@/runtime`.

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/tracedRunner.ts` | `retryWithTrace(effect, schedule, label)`; use `Schedule.driver` + loop; keep `emitStart`/`emitEnd`/`emitRetry` (same id for association) |
| `src/runtime/index.ts` | Export `retryWithTrace as retry` so programs use plain `retry` |
| `src/lib/programs.ts` | `retry(flakyEffect, Schedule.recurs(3), "flaky-task")`; exponential backoff with `Schedule.addDelay(Schedule.recurs(5), ...)` |
| `public/fallback-types.d.ts` | Add minimal Schedule types (`Schedule.recurs`, `Schedule.addDelay`) for fallback runtime |

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
3. On failure: `driver.next(error)` — if success (schedule says continue), emit `retry:attempt`, loop; if failure (schedule exhausted), emit `effect:end` (failure), fail

## Key Learnings

### Schedule Consumes the Error

The Schedule type is `Schedule<Out, In, R>`. For retry, `In` is the error type `E`. Each failure is fed to `driver.next(error)`; the schedule decides whether to continue or stop.

### Keep TraceEmitter for Span Association

We keep `emitStart`, `emitEnd`, and `emitRetry` so all share the same `id`. This ensures `retry:attempt` stays correctly associated with the retry span in the ExecutionLog.

### Built-in Schedules

- `Schedule.recurs(n)` — recurs `n` times (equivalent to `n` retries)
- `Schedule.addDelay(schedule, f)` — adds delay between attempts; use `"100 millis"` or `"1 second"` for timeline visibility

## Example Programs

- **Retry** (`retry`): Ref-backed effect that fails on attempts 1 and 2, succeeds on 3; `retry(flakyEffect, Schedule.recurs(3), "flaky-task")` — two `retry:attempt` lines then `effect:end` success.
- **Retry (Exponential Backoff)** (`retryExponentialBackoff`): Same as Retry but with `Schedule.addDelay(Schedule.recurs(5), (n) => ...)` — 100ms, 200ms, 400ms, ... between attempts; timeline shows fiber:suspend during delays.

## What's Next

Phase 9 completes the retry refactor. Future phases may explore the acquire/finalizer refactor (Effect.withSpan for acquire) or additional Schedule patterns (jitter).
