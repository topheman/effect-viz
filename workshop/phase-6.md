# Phase 6: Supervisor for Automatic Fiber Tracking

## Concepts

### Effect's Supervisor as Runtime Hook

Effect's **Supervisor** is a runtime hook. When you add a Supervisor via `Layer.addSupervisor(supervisor)`, the runtime calls `onStart` when any fiber is forked and `onEnd` when it completes. No user code changes are needed for fiber lifecycle—fibers appear automatically in FiberTreeView.

### Supervisor.AbstractSupervisor

`Supervisor.AbstractSupervisor<void>` provides the base. You implement:
- **onStart**: Called when a fiber starts; receives parent (Option), fiber; emit `fiber:fork`.
- **onEnd**: Called when a fiber ends; receives Exit and fiber; emit `fiber:end` or `fiber:interrupt` based on Exit.

### Synchronous Callbacks

Supervisor callbacks are **synchronous**. In the WebContainer, the emit callback writes to stdout: `process.stdout.write("TRACE_EVENT:" + JSON.stringify(event) + "\n")`. In the fallback path, it pushes to React state.

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/vizSupervisor.ts` | `VizSupervisor` class extending `Supervisor.AbstractSupervisor<void>`; `makeVizLayers(onEmit)` returns `Supervisor.addSupervisor` layer; `shouldIgnoreFiber` filters internal/non-app fibers |
| `src/runtime/runProgram.ts` | `runProgramFork(program, onEmit)` — forks program with `Effect.runFork`, uses `updateRefs` to emit root `fiber:fork`, returns fiber + promise that emits `fiber:end`/`fiber:interrupt` on completion |
| `src/hooks/useEventHandlers.ts` | Fallback play: adds `makeVizLayers(onEmit)` to layers, uses `runProgramFork` |
| `src/services/webcontainer.ts` | RUNNER_JS: adds `makeVizLayers`, uses `runProgramFork`; same layer merge pattern |
| `src/lib/programs.ts` | Migrated `basic`, `multiStep`, `nestedForks`, `racing` to plain `Effect.fork`; source strings updated |

### Key Functions

```typescript
// VizSupervisor: onStart emits fiber:fork (fiberId, parentId, label); onEnd emits fiber:end or fiber:interrupt
export function makeVizLayers(onEmit: (event: TraceEvent) => void): Layer.Layer<never>

// DRY for fallback and WebContainer: fork program, emit root fiber:fork via updateRefs, return fiber + promise
export function runProgramFork<A>(
  program: Effect.Effect<A, unknown, never>,
  onEmit: (event: TraceEvent) => void,
): { fiber: Fiber.RuntimeFiber<A, unknown>; promise: Promise<A> }
```

### Internal Fiber Filtering

The Supervisor sees **all** fibers, including internal ones. We filter via `shouldIgnoreFiber`: fibers with `currentContext.unsafeMap.size === 0` are ignored.

- **Cleanup fibers** (e.g. from `Effect.scoped`) **can** be identified and filtered: they have no services injected, so their context map is empty.
- **Runtime fibers** (e.g. from `Effect.race`, `Effect.all`) **cannot** be identified: they inherit the parent's context, so they look like app fibers and may still appear in FiberTreeView.

### Root Fiber Emission

The Supervisor's `onStart` fires for every fiber including the root. However, `Effect.runFork` creates the root fiber before the Supervisor is in the runtime context. So we use `runProgramFork` with `updateRefs` to emit the root `fiber:fork` when the fiber is created, and the promise's then/catch to emit `fiber:end` or `fiber:interrupt` on completion.

## Key Learnings

### Why runProgramFork Instead of Supervisor Alone

The root fiber is created by `Effect.runFork(program)`. At that moment, the program's layers (including Supervisor) are provided to the *program*, but the root fiber itself is created by the runtime *before* the program runs. The Supervisor is part of the program's environment, so it sees child fibers but not the root. Hence `runProgramFork` uses `updateRefs` to emit the root fiber:fork and the promise to emit fiber:end/fiber:interrupt.

### Fork Labels

Plain `Effect.fork` has no label. We use `FiberId.threadName(fiber.id())` as the label—Effect's internal thread name (e.g. `"#0"`, `"#1"`). The FiberTreeView displays this.

## Example Programs (Migrated)

- **Basic** (`basic`): Uses `Effect.fork` for worker1 and worker2; Supervisor emits fiber:fork for each.
- **Multi-Step** (`multiStep`): Single `Effect.fork` with inner gen; Supervisor tracks the worker fiber.
- **Nested Forks** (`nestedForks`): Parent → child → grandchild hierarchy; Supervisor emits all fiber:fork events.
- **Racing** (`racing`): `Effect.fork` + `Effect.race(Fiber.join(...))`; Supervisor tracks both racer fibers.

## What's Next

**Phase 7: Custom Tracer for Effect.withSpan** ✅ — See [phase-7.md](./phase-7.md).
