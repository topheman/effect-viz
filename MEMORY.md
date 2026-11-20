# EffectViz - Workshop Memory

**Quick Context**: See [`workshop/README.md`](workshop/README.md) for full documentation.

## Current Phase

**Effect 4**: the project runs on `effect` 4.1.4, on both run paths. Phases 1 to 11 were written on Effect 3 and their docs record each phase as it was built, except phase 9's retry loop and phase 10's paused start, which describe the current code; [`workshop/effect-4-migration.md`](workshop/effect-4-migration.md) says what Effect 4 changed in the runtime, the traces and the app, and [`workshop/ARCHITECTURE.md`](workshop/ARCHITECTURE.md) describes the design as it is now.

**Phase 11**: COMPLETE ✅ — speed is live during a run. The rate travels on the control channel alongside pause, resume and step, so a running program is retuned where it stands and a paused one resumes at the rate chosen while it was frozen. `VIZ_RATE` still sets the rate a run opens at.

## Completed Phases

1. [**Lazy evaluation, success/failure**](workshop/phase-1.md): `TraceEmitter` service, `traceStore`, Execution Log, Play.
2. [**Fibers, fork/join, interruption**](workshop/phase-2.md): `fiberStore`, Fiber Tree, real fiber ids, Reset.
3. [**Scheduling, delays, suspended fibers**](workshop/phase-3.md): suspended state in the tree, Timeline.
4. [**Errors and retries**](workshop/phase-4.md): `effect:end` failures, `retry:attempt`.
5. [**Scopes and resources**](workshop/phase-5.md): `addFinalizer`, `acquireRelease`, `finalizer` and `acquire` events.
6. [**Automatic fiber tracking**](workshop/phase-6.md): fibers come from a runtime hook, `Tracer.context`, read by `fiberLifecycle.ts`, not from wrappers.
7. [**Custom Tracer**](workshop/phase-7.md): `Effect.withSpan` emits `effect:start`/`effect:end` through `vizTracer.ts`.
8. [**Sleep visibility**](workshop/phase-8.md): `fiber:suspend`/`fiber:resume` from the runtime, plain `Effect.sleep`; each suspend carries its `reason` (`yield`, `sleep` with its duration, `wait`).
9. [**Retry with a Schedule**](workshop/phase-9.md): `retry(effect, schedule, label)` mirrors `Effect.retry`, stepping through the schedule with `Schedule.toStepWithSleep`. The examples use `Schedule.recurs` and `Schedule.exponential` with `Schedule.upTo`.
10. [**Slow mode and stepper**](workshop/phase-10.md) (issue #13): `VirtualClock`, the Effect `Clock` over it, the `Date` shim, `GatedScheduler` and the step ladder, the control channel to the WebContainer, speed and stepper controls, five teaching examples.
11. [**Live speed**](workshop/phase-11.md): rate changes during a run, on both paths.

## Design Decisions

- **Effect's own hooks**: one `Tracer` (spans + `Tracer.context`), a virtual `Clock` and a gated `Scheduler`, installed by `withViz` with `Effect.provideService`. The user's program is never rewritten.
- **Service + Layer** for what has no hook: `TraceEmitter` (a `Context.Service`) behind `retry`, `addFinalizer`, `acquireRelease`.
- **Real fiber ids**: `fiber.id`, printed `#N`.
- **One runtime, two paths**: the browser fallback and the WebContainer both call `withViz`/`runProgramFork`, with the same pinned `effect` version.
- **The trace says what happened**: hints and the `v3 → v4` changes read the events alone; the suspend `reason` exists so nothing has to be guessed from timestamps.
- Details in [`workshop/ARCHITECTURE.md`](workshop/ARCHITECTURE.md).

## Key Files

- `src/runtime/runProgram.ts` - `withViz` (installs tracer, scheduler, clock, layers) and `runProgramFork`
- `src/runtime/vizTracer.ts` - the Tracer: spans and `Tracer.context`
- `src/runtime/fiberLifecycle.ts` - fork/suspend/resume/end from primitives; `SleepLog`, `InProgram`
- `src/runtime/vizClock.ts` - Effect `Clock` over `VirtualClock`
- `src/runtime/virtualClock.ts` - rate-scaled virtual time, park-on-pause, step-to-deadline
- `src/runtime/gatedScheduler.ts` - pause and step the runtime by gating tasks and `shouldYield`
- `src/runtime/stepper.ts` - the step ladder over scheduler + clock
- `src/runtime/tracedRunner.ts` - `retry`, `addFinalizer`, `acquireRelease` (exported from `index.ts`)
- `src/runtime/controlChannel.ts` - command/reply codecs over the container's stdin/stdout
- `src/runtime/dateShim.ts` - `Date` reads virtual time; WebContainer only
- `src/services/webcontainer.ts` - WebContainer service and `RUNNER_JS`
- `src/types/trace.ts` - `TraceEvent` definitions
- `src/stores/traceStore.tsx`, `src/stores/fiberStore.tsx` - event state, fiber state
- `src/hooks/useEventHandlers.ts` - Play/Step/Reset on both paths
- `src/lib/programs.ts` - example programs with their source
- `src/lib/traceHints.ts`, `src/lib/traceChanges.ts` - log hints, Effect 3 → 4 changes
- `src/lib/mirroredClock.ts`, `src/lib/containerController.ts` - the page's side of the control channel
- `src/components/visualizer/` - ExecutionLog, FiberTreeView, TimelineView

## Documentation

- [`workshop/README.md`](workshop/README.md) - Documentation overview
- [`workshop/ARCHITECTURE.md`](workshop/ARCHITECTURE.md) - Design decisions
- [`workshop/effect-4-migration.md`](workshop/effect-4-migration.md) - What Effect 4 changed
- [`workshop/trace-events.md`](workshop/trace-events.md) - Which hook reports each event
