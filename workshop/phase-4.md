# Phase 4: Errors and Retries

## Concepts

### Typed Errors

Effect tracks errors in the type: `Effect<A, E, R>` means success type `A`, error type `E`, requirements `R`. Errors are values; you handle them with combinators instead of try/catch. The visualizer shows `effect:end` with `result: "success"` or `result: "failure"` (and optional `error`).

### Error Handling

`catchAll`, `catchTag`, `orElse` let you recover or transform errors. A traced effect that fails then recovers still emits `effect:end` (failure) for the failing step, then continues; the log shows both.

### Retries

Retrying means running the same effect again after a failure. To **track attempts** we need to observe each run: `Effect.retry()` gives only one final `Exit`, so we use a **loop** with `Effect.exit(effect)` and emit `retry:attempt` after each failure before retrying.

### Ref for State Across Attempts

`Ref` is mutable state inside Effect. In the retry example, a `Ref` counts attempts so the inner effect can "fail twice then succeed" and we see multiple `retry:attempt` events with different `lastError` values.

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/types/trace.ts` | `RetryAttemptEvent` (id, label, attempt, lastError, timestamp?) |
| `src/runtime/tracedRunner.ts` | `emitRetry`, `retryWithTrace` (loop-based, effect:start/end + retry:attempt) |
| `src/lib/programs.ts` | `failureAndRecovery` program, `retry` program (Ref + retryWithTrace) |
| `src/components/visualizer/ExecutionLog.tsx` | Failure styling (red), retry:attempt from current event, `formatError` |
| `src/hooks/useEventHandlers.ts` | Program as `Effect<unknown, unknown, TraceEmitter>` for union of program types |

### Key Functions

```typescript
// Emit retry:attempt (same span id as the retried effect)
export const emitRetry = (
  id: string,
  label: string,
  attempt: number,
  lastError: unknown,
): Effect.Effect<void, never, TraceEmitter>

// Loop: run effect, on success emit effect:end and return; on failure either
// emit effect:end and re-fail, or emit retry:attempt and retry. Total attempts = 1 + maxRetries.
export function retryWithTrace<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: { maxRetries: number; label: string },
): Effect.Effect<A, E, R | TraceEmitter>
```

### withTrace and Failures

`withTrace` already used `Effect.onExit`: on failure it emits `effect:end` with `result: "failure"` and `Cause.squash(exit.cause)` as the error. No change needed for failure visibility.

## Key Learnings

### Why a Loop for Retry Tracing

`Effect.retry(effect, { times: n })` runs the effect internally and only gives one final `Exit`. To emit `retry:attempt` after each failed try, we run the effect ourselves in a `while (true)` loop with `Effect.exit(effect)` and react each time.

### One Span id for the Whole Retry

`retryWithTrace` creates a single `id` and uses it for `effect:start`, every `retry:attempt`, and `effect:end`. The log/timeline can show one "retry span" with multiple attempts.

### ExecutionLog: Use Current Event for retry:attempt

Each log line must use the **current** event. Looking up the first `retry:attempt` with the same `id` made every line show the first attempt's error; we now use `event.attempt`, `event.label`, and `event.lastError` directly.

## UI Enhancements

### ExecutionLog

- `effect:end` with `result: "failure"` styled in red
- `retry:attempt`: "Retry attempt: #N label (error message)" using current event; `formatError(lastError)` for readable errors

## Example Programs

- **Failure & Recovery** (`failureAndRecovery`): setup → risky-step (fails) → catchAll → recovery. Shows failure and recovery in the log.
- **Retry** (`retry`): Ref-backed effect that fails on attempts 1 and 2, succeeds on 3; `retryWithTrace` with maxRetries so we see two `retry:attempt` lines then `effect:end` success.

## What's Next

**Phase 5: Scopes & Resources** will cover:

- Scope and resource lifetime
- `Effect.acquireRelease` and finalizers
- When finalizers run; optional "finalizer ran" visibility in the log

## Test

1. Run **Failure & Recovery**: ExecutionLog shows effect:end (failure) for "risky-step", then success for "recovery".
2. Run **Retry**: ExecutionLog shows effect:start "flaky-task", retry:attempt #1 and #2 with distinct errors (Attempt 1 failed, Attempt 2 failed), then effect:end "flaky-task" success.
