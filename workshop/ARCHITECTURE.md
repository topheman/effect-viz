# EffectViz Architecture

## Design Decisions

### Effect's own hooks, not a rewritten program

The visualizer never transforms the user's program. It runs it inside services Effect already reads from the fiber's context, and those services report what the runtime does:

- **One `Tracer`** (`vizTracer.ts`) does two jobs. Its `span` turns every `Effect.withSpan` into `effect:start` and `effect:end`. Its `context` receives every primitive the run loop evaluates, with the fiber evaluating it, and `fiberLifecycle.ts` reads the fiber lifecycle out of that stream: forks, suspends, resumes and ends. Effect has no other fiber lifecycle hook.
- **A `Clock`** (`vizClock.ts`) over the `VirtualClock`, so every sleep, schedule delay, timeout and timestamp runs on virtual time the speed control can slow down.
- **A `Scheduler`** (`GatedScheduler`) that can hold the runtime still, so the stepper can release it one operation at a time.

`withViz` in `runProgram.ts` installs all three with `Effect.provideService`, around the program's own layers and the `TraceEmitter`. The tracer is outermost, so it is in place before the scheduler, the clock and any layer, and the root is simply the one fiber discovered with no parent. Both run paths call `withViz` and `runProgramFork`: the browser fallback from `useEventHandlers`, the WebContainer from `RUNNER_JS`, which imports them from the bundled `runtime.js`.

[trace-events.md](./trace-events.md) maps each event type to the hook that reports it, and [effect-4-migration.md](./effect-4-migration.md) explains each hook against the Effect 4 runtime.

### Reading the fiber lifecycle from primitives

`Tracer.context` sees primitives, not fibers, so each lifecycle event is an inference, and each inference rests on something the runtime guarantees.

A fiber seen for the first time is a fork. Its parent is the fiber whose public fork (`forkChild`, `forkScoped`…) returned it, or the fiber still on the stack when an operator such as `race` or `Effect.all` started it synchronously, or, when it started from an observer with no fiber on the stack, the fiber that last forked with the same `Context`. A primitive that returns the run loop's `Yield` sentinel (`Symbol.for("effect/Effect/Yield")`) suspends its fiber, unless the fiber is yielding its `Exit` because it is done; the fiber's next primitive is its resume. `fiber.addObserver` reports the end: `fiber:interrupt` when the exit's cause holds only interrupts, otherwise `fiber:end` with `result: "success"` or `"failure"`. A span's `effect:end` follows the same rule and can be `"interrupted"`.

Each `fiber:suspend` carries its `reason`: `yield` when the primitive was `Effect.yieldNow`, `sleep` with its duration when the Clock started a timer for that fiber inside the same primitive, `wait` for anything else. The Clock and the tracer share a `SleepLog` that `withViz` creates per run, so `fiberLifecycle` can ask whether the suspending fiber just started a sleep. Timestamps cannot tell a yield from a short sleep: a busy main thread resumes a yield tens of milliseconds late.

Fibers that build the program's layers are left out: `withViz` sets an `InProgram` reference to `false` around the layer build only, and the tracer ignores every fiber that reads it as `false` when first seen.

### Holding the runtime still

Effect gives each fiber a dispatcher made by the scheduler and asks the scheduler's `shouldYield` before each operation. While playing, `GatedScheduler` hands both to Effect's `MixedScheduler`, so execution is unchanged. While paused, it queues every task and answers `shouldYield` with yes, so a fiber woken from anywhere (a join, a timer, an interruption) runs one operation and hands itself back to the queue. The virtual clock's timers go through `GatedScheduler.wake`, so a timer firing while paused only queues the fiber it wakes. `Stepper.pause` gates the scheduler and sets the clock's rate to 0, so a paused program's time stands still too.

A raw step is one operation, which is usually invisible. A step releases tasks until the trace moves (`releaseUntilVisible`, capped at 1000 tasks per release) and advances virtual time to the next deadline when nothing is runnable. A paused start needs nothing added to the program. The tracer is in place one primitive before the gate, so the primitive that installs the gated scheduler emits the root's fork; the next `shouldYield` reaches the gate, which holds the root, and since a forced yield goes through no primitive it emits nothing. A run started paused therefore traces exactly like one started with Play.

### Service + Layer for the visualizer's own events

Retries, finalizers and acquisitions have no runtime hook, so `tracedRunner.ts` wraps them (`retry`, `addFinalizer`, `acquireRelease`) and emits through the `TraceEmitter` service, a `Context.Service` provided by `makeTraceEmitterLayer`. The wrappers declare `TraceEmitter` in their requirements, which keeps Effect's dependency injection visible in the code.

### Public vs Private Runtime Exports

Public APIs match Effect's naming (`retry`, `addFinalizer`, `acquireRelease`) so programs feel native. Private EffectViz APIs (trace emitter, `withViz`, `runProgramFork`, scheduler, stepper, control channel) are prefixed with `_` to avoid clashing with user imports.

### Real fiber ids

The visualizer uses the runtime's own fiber ids (`fiber.id`, a number from one global counter, printed as `#N`) instead of ids of its own. A fresh WebContainer process starts its root at `#1`; the in-browser path carries on from whatever the page has already run.

### Event-Driven Visualization

```
Effect runtime → TraceEvents → stores → React UI
```

- `src/types/trace.ts` defines the `TraceEvent` contract.
- The tracer and the `TraceEmitter` emit events through one `onEmit` callback; in the WebContainer it writes them to stdout, which `spawnAndParse` reads back on the page.
- `traceStore` keeps the events for the Execution Log, `fiberStore` folds them into fiber states for the Fiber Tree and the Timeline.
- `traceHints` and `traceChanges` read the event list and nothing else, so what they say is what the trace proves.

## File Structure

```
src/
├── runtime/                 # Effect-side code, no React
│   ├── runProgram.ts        # withViz, runProgramFork
│   ├── vizTracer.ts         # Tracer: spans + Tracer.context
│   ├── fiberLifecycle.ts    # fork/suspend/resume/end from primitives, SleepLog, InProgram
│   ├── vizClock.ts          # Effect Clock over VirtualClock
│   ├── virtualClock.ts      # rate-scaled virtual time, timers
│   ├── gatedScheduler.ts    # pause and step the runtime
│   ├── stepper.ts           # the step ladder: release, else advance time
│   ├── tracedRunner.ts      # retry, addFinalizer, acquireRelease
│   ├── traceEmitter.ts      # TraceEmitter service
│   ├── controlChannel.ts    # pause/resume/step/rate over the container's stdio
│   ├── dateShim.ts          # Date reads virtual time (WebContainer only)
│   └── index.ts             # what programs and RUNNER_JS import
├── services/
│   └── webcontainer.ts      # WebContainer service, RUNNER_JS
├── effects/
│   └── spawnAndParse.ts     # runs the program in the container, parses its stdout
├── stores/                  # traceStore, fiberStore, webContainerLogsStore
├── lib/                     # programs, traceHints, traceChanges, mirroredClock…
├── hooks/                   # useEventHandlers (Play/Step/Reset), UI state stores
└── components/
    ├── visualizer/          # ExecutionLog, FiberTreeView, TimelineView
    ├── editor/              # CodeEditor, WebContainerLogsPanel
    └── layout/              # MainLayout, PlaybackControls
```

## Key Patterns

### A program as the user writes it

```typescript
const program = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(task.pipe(Effect.withSpan("task")));
  yield* Effect.sleep("1 second");
  return yield* Fiber.join(fiber);
});
```

Nothing here mentions the visualizer: the fork, the sleep and the join come from `Tracer.context`, the span from `Tracer.span`.

### Running a program

```typescript
const { fiber, promise } = runProgramFork(
  withViz(rootEffect, { onEmit, clock: virtualClock, scheduler, layers }),
);
```
