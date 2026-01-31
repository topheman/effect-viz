# Phase 2: Fibers, Fork/Join, Interruption

## Concepts

- **Fibers**: Lightweight virtual threads (cheap, cooperative, structured)
- **Forking**: `Effect.fork(effect)` spawns a child fiber
- **Joining**: `Fiber.join(fiber)` waits for completion
- **Interruption**: `Fiber.interrupt(fiber)` stops a fiber gracefully
- **Structured concurrency**: Parent-child relationships tracked automatically

## Implementation

### Created Files

- `src/stores/fiberStore.tsx` - Fiber state management
- `src/components/visualizer/FiberTreeView.tsx` - Tree visualization
- `src/lib/programs.ts` - Example programs (basic, multiStep, nestedForks, racing)

### Key Functions

```typescript
// Fork with tracing
export const forkWithTrace = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label?: string
): Effect.Effect<Fiber.RuntimeFiber<A, E>, never, R | TraceEmitter>

// Run program with root fiber tracking
export const runProgramWithTrace = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  label?: string
): Effect.Effect<A, E, R | TraceEmitter>
```

### Fiber Tracking

- Uses `Effect.fiberId` to get current fiber ID
- Uses `FiberId.threadName(id)` to convert to string (e.g., "#1")
- Uses `fiber.id()` to get forked fiber's ID
- Parent-child relationships tracked via `parentId` in events

## Learning Outcomes

- `Effect.fiberId` returns the current fiber's ID
- `Effect.runFork` returns a fiber handle for later control
- `Fiber.interrupt` is async (returns `Effect<Exit<A, E>>`)
- Fibers form a tree structure automatically
- Interruption propagates to children (structured concurrency)

## Example Programs

1. **basic**: Sequential init → fork 2 workers → join both
2. **multiStep**: Single fiber with 3 sequential steps
3. **nestedForks**: 3-level hierarchy (parent → child → grandchild)
4. **racing**: Two effects racing (loser gets interrupted)

## UI Features Added

- Program selector dropdown
- Editor shows program source code (readonly)
- Reset button interrupts running fibers
- Fiber tree visualization with parent-child relationships
