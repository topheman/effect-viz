# Phase 3: Scheduling, Delays, and Suspended Fibers

## Concepts

### Fiber Suspension vs Blocking

When a fiber calls `Effect.sleep()`, it **suspends** rather than blocks:

- **Blocking** (traditional threads): Thread is parked, consumes resources
- **Suspending** (Effect fibers): Fiber yields control, resources freed for other work

This is why Effect can handle thousands of fibers where you could only have hundreds of threads.

### Cooperative Scheduling

Effect uses **cooperative scheduling**:

- Fibers voluntarily yield at **suspension points**
- The scheduler never forcibly interrupts a running fiber mid-computation
- Suspension points include: `Effect.sleep()`, `Effect.async()`, `Fiber.join()`, `Effect.yieldNow()`

### The Clock Abstraction

Effect abstracts time through a `Clock` service:

- Production uses real time
- Tests can use `TestClock` to control time manually
- This enables deterministic testing of time-dependent code

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/tracedRunner.ts` | Added `sleepWithTrace()` |
| `src/stores/fiberStore.tsx` | Handle `sleep:start`, `sleep:end` events |
| `src/lib/programs.ts` | Updated examples to use `sleepWithTrace()` |
| `src/components/visualizer/FiberTreeView.tsx` | Suspended indicator (zzz + pulse) |
| `src/components/visualizer/TimelineView.tsx` | Full implementation with real-time updates |

### Key Functions

```typescript
// Sleep with tracing - emits sleep:start and sleep:end events
export const sleepWithTrace = (
  duration: Duration.DurationInput,
): Effect.Effect<void, never, TraceEmitter>
```

### FiberStore Event Handling

```typescript
case "sleep:start": {
  const fiber = next.get(event.fiberId);
  if (fiber) fiber.state = "suspended";
  break;
}

case "sleep:end": {
  const fiber = next.get(event.fiberId);
  if (fiber) fiber.state = "running";
  break;
}
```

### TimelineView Features

- **Fiber lanes**: Each fiber gets a horizontal row
- **Color segments**: Running (green), Suspended (yellow), Completed (blue), Interrupted (red)
- **Real-time updates**: Bars grow as fibers run (50ms refresh interval)
- **Auto-scaling**: Default 3s view, expands as needed
- **Final state markers**: Small caps show completed/interrupted status

## Key Learnings

### Duration Handling

```typescript
// DurationInput can be string, number, or Duration
const millis = Duration.toMillis(Duration.decode(duration));
```

### Limitations of Manual Instrumentation

Our wrapper approach (`sleepWithTrace`, `forkWithTrace`) only traces what we explicitly wrap:

- `Effect.race()` creates internal fibers we can't see
- Solution: Use explicit `forkWithTrace` + `Effect.race` on `Fiber.join`
- Future: Runtime hooks (Supervisor, Tracer) will capture everything automatically

### Racing with Visible Fibers

```typescript
// Fork explicitly to make fibers visible in timeline
const fast = yield* forkWithTrace(sleepWithTrace("1 second"), "fast");
const slow = yield* forkWithTrace(sleepWithTrace("2 seconds"), "slow");

// Race the joins (not the fibers directly)
const winner = yield* Effect.race(Fiber.join(fast), Fiber.join(slow));

// Clean up
yield* Fiber.interrupt(fast);
yield* Fiber.interrupt(slow);
```

## UI Enhancements

### FiberTreeView

- Suspended fibers show `[suspended]` in yellow with "zzz" indicator
- Pulse animation on suspended state badge

### TimelineView

- Legend showing all state colors
- Time axis with tick marks (200ms/500ms/1s intervals)
- Hover tooltips showing state and duration
- Ongoing segments pulse to indicate activity

## What's Next

**Phase 4: Errors & Retries** will cover:

- Typed errors in Effect (`Effect<A, E, R>`)
- Error handling combinators (`catchAll`, `catchTag`)
- Retry policies and schedules
- Finalizers and guaranteed cleanup

## Test

Run any example program and observe:

1. **FiberTreeView**: Fibers toggle between `[running]` and `[suspended]`
2. **TimelineView**: Color segments show state transitions in real-time
3. **ExecutionLog**: `sleep:start` and `sleep:end` events appear with fiber IDs
