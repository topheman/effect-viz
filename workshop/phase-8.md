# Phase 8: Sleep Visibility via Supervisor onSuspend/onResume

## Concepts

### Supervisor Suspension Hooks

Effect's Supervisor provides `onSuspend` and `onResume` callbacks:
- **onSuspend**: Called when a fiber yields (e.g. at `Effect.sleep`, `Effect.async`) or when it completes (in a `finally` block).
- **onResume**: Called when a suspended fiber resumes execution.

**Important**: `onSuspend` fires in a `finally` block when a fiber completes. Event order is `onEnd` first, then `onSuspend`. We must ignore the spurious `fiber:suspend` when the fiber is already in a terminal state (completed/interrupted).

### No Duration from Supervisor

The Supervisor does not know *why* a fiber suspended or for how long. Duration in TimelineView is inferred from timestamps between suspend and resume.

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/types/trace.ts` | Added `FiberSuspendEvent`, `FiberResumeEvent`; removed `SleepStartEvent`, `SleepEndEvent` from TraceEvent union |
| `src/runtime/vizSupervisor.ts` | Override `onSuspend` and `onResume`; emit `fiber:suspend`, `fiber:resume` |
| `src/stores/fiberStore.tsx` | Handle `fiber:suspend` (→ suspended), `fiber:resume` (→ running); ignore suspend when already completed/interrupted |
| `src/components/visualizer/TimelineView.tsx` | Handle `fiber:suspend`/`fiber:resume` for segment transitions; same spurious-event guard |
| `src/components/visualizer/ExecutionLog.tsx` | Format and color `fiber:suspend`, `fiber:resume` |
| `src/lib/programs.ts` | Migrated from `sleepWithTrace` to `Effect.sleep` |
| `src/runtime/tracedRunner.ts` | Removed `sleepWithTrace` |

### Key Learnings

### Spurious onSuspend on Completion

Effect's `evaluateEffect` calls `onSuspend` in a `finally` block when a fiber finishes. So we receive `fiber:suspend` *after* `fiber:end`. If we applied it, we'd overwrite completed/interrupted with suspended, causing the timeline to never stop. Fix: only apply `fiber:suspend` when the fiber is not yet in a terminal state.

### Plain Effect.sleep

Programs now use `Effect.sleep("1 second")` with no wrapper. Suspension visibility is fully automatic via the Supervisor.

## Example Programs (Migrated)

All programs that used sleep now use `Effect.sleep`:
- **Basic**, **Multi-Step**, **Nested Forks**, **Racing**

## What's Next

**Phase 9: Retry and Finalizers (Optional)** — Document that retry and finalizers remain as thin wrappers; optionally refactor to use `Effect.withSpan` where possible.
