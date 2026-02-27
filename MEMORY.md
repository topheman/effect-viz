# EffectViz - Tutor Memory

**Quick Context**: See [`workshop/README.md`](workshop/README.md) for full documentation.

## Current Phase
**Phase 6**: COMPLETE ✅

**Recent**: VizSupervisor for automatic fiber tracking, runProgramFork, programs migrated to Effect.fork

## Completed Phases

### Phase 1: Lazy Evaluation and Success/Failure
- [x] TraceStore (`src/stores/traceStore.tsx`)
- [x] ExecutionLog wired with color-coded events
- [x] `TraceEmitter` service + `makeTraceEmitterLayer`
- [x] `withTrace()` using Service + Layer pattern
- [x] Play button wired via `useEventHandlers` hook

### Phase 2: Fibers, Fork/Join, Interruption
- [x] FiberStore with processEvent (fork, end, interrupt)
- [x] buildFiberTree recursive function
- [x] `forkWithTrace` using Effect's real FiberId
- [x] `runProgramWithTrace` for root fiber tracking
- [x] Parent-child relationships via FiberId.threadName
- [x] FiberTreeView wired to display fiber hierarchy
- [x] Example programs in `src/lib/programs.ts`
- [x] Racing example with interruption
- [x] Reset button to interrupt running fibers

### Phase 3: Scheduling, Delays, Suspended Fibers
- [x] `sleepWithTrace()` - emits sleep:start/sleep:end events
- [x] FiberStore handles sleep events (suspended state)
- [x] FiberTreeView shows suspended indicator (zzz + pulse animation)
- [x] TimelineView with real-time color segments
- [x] Auto-scaling time axis (default 3s)
- [x] Racing example rewritten with explicit fiber forking
- [x] Legend for timeline states (running/suspended/completed/interrupted)

### Phase 4: Errors and Retries
- [x] Failure & Recovery program (`failureAndRecovery`)
- [x] Retry program with Ref (`retry`) and `retryWithTrace`
- [x] `retryWithTrace` loop-based: effect:start/effect:end + retry:attempt per failed attempt
- [x] `RetryAttemptEvent` and `emitRetry` in tracedRunner
- [x] ExecutionLog: failure styling (red), retry:attempt from current event, formatError

### Phase 6: Supervisor for Automatic Fiber Tracking
- [x] VizSupervisor extending Supervisor.AbstractSupervisor<void>
- [x] makeVizLayers(onEmit) → Supervisor.addSupervisor layer
- [x] runProgramFork for root fiber emission (updateRefs + promise)
- [x] shouldIgnoreFiber filters internal/non-app fibers
- [x] forkWithTrace, runProgramWithTrace removed
- [x] basic, multiStep, nestedForks, racing migrated to Effect.fork
- [x] makeVizLayers wired in fallback and WebContainer RUNNER_JS

### Phase 5: Scopes and Resources
- [x] `FinalizerEvent`, `AcquireEvent` in trace types
- [x] `emitFinalizer`, `emitAcquire` in tracedRunner
- [x] `addFinalizerWithTrace` (wraps Effect.addFinalizer, emits on run)
- [x] `acquireReleaseWithTrace` (built on addFinalizerWithTrace; acquire event + release finalizer)
- [x] ExecutionLog: finalizer and acquire cases
- [x] Basic Finalizers program (3 finalizers, LIFO demo) and Acquire Release program; both use Effect.scoped

### Key Learning (Phase 3)
- Fibers **suspend** (yield control) rather than block
- Cooperative scheduling: fibers yield at suspension points
- `Duration.decode()` converts DurationInput to Duration
- `Effect.race` on `Fiber.join` calls for traceable racing
- Manual instrumentation limitations vs runtime hooks

### Key Learning (Phase 4)
- Typed errors: effect:end with result "failure" and error; withTrace already used onExit
- Retry attempt tracking: loop with Effect.exit(effect), emit retry:attempt, same span id
- Ref for state across retry attempts (e.g. fail N times then succeed)
- ExecutionLog must use current event for retry:attempt (not first match)

### Key Learning (Phase 6)
- Supervisor is a runtime hook: onStart/onEnd fire for every fiber; no user code changes
- Root fiber: Supervisor sees child fibers but not the root (created before program runs); runProgramFork uses updateRefs + promise
- Internal fibers: cleanup fibers (Effect.scoped) can be filtered (no services injected); Effect.race/all fibers cannot be identified (inherit parent context)

### Key Learning (Phase 5)
- addFinalizer callback must **return** an Effect (emit then run user finalizer); runtime provides env when it runs
- Finalizers run LIFO; use Effect.scoped(effect) so programs have a scope
- acquireReleaseWithTrace built on addFinalizerWithTrace; AcquireEvent for acquire outcome, FinalizerEvent for release

## Design Decisions
- **Service + Layer** pattern for TraceEmitter
- R channel (Requirements) introduced early
- `makeTraceEmitterLayer` bridges Effect to React
- **Manual wrappers** for V1 (explicit, educational)
- **Runtime hooks** planned for V2 (automatic, production-ready)

## Key Files
- `src/runtime/vizSupervisor.ts` - VizSupervisor, makeVizLayers (Phase 6)
- `src/runtime/runProgram.ts` - runProgramFork (root fiber emission)
- `src/types/trace.ts` - TraceEvent definitions (includes sleep, finalizer, acquire events)
- `src/stores/traceStore.tsx` - Event state
- `src/stores/fiberStore.tsx` - Fiber state (handles suspension)
- `src/runtime/tracedRunner.ts` - Instrumented runner (`withTrace`, `forkWithTrace`, `sleepWithTrace`, `retryWithTrace`, `addFinalizerWithTrace`, `acquireReleaseWithTrace`, `emitFinalizer`, `emitAcquire`)
- `src/hooks/useEventHandlers.ts` - Play/Reset handlers with program selection
- `src/components/visualizer/ExecutionLog.tsx` - Event log
- `src/components/visualizer/FiberTreeView.tsx` - Fiber tree with suspended indicator
- `src/components/visualizer/TimelineView.tsx` - Real-time timeline visualization
- `src/lib/programs.ts` - Example programs with source code

## Learning Phases
1. ~~**Phase 1**: Lazy evaluation, success/failure~~ ✅ See [`workshop/phase-1.md`](workshop/phase-1.md)
2. ~~**Phase 2**: Fibers, fork/join, interruption~~ ✅ See [`workshop/phase-2.md`](workshop/phase-2.md)
3. ~~**Phase 3**: Scheduling, delays, suspended fibers~~ ✅ See [`workshop/phase-3.md`](workshop/phase-3.md)
4. ~~**Phase 4**: Errors, retries~~ ✅ See [`workshop/phase-4.md`](workshop/phase-4.md)
5. ~~**Phase 5**: Scopes, resources, finalizers~~ ✅ See [`workshop/phase-5.md`](workshop/phase-5.md)
6. ~~**Phase 6**: Supervisor for automatic fiber tracking~~ ✅ See [`workshop/phase-6.md`](workshop/phase-6.md)

## Documentation
- [`workshop/README.md`](workshop/README.md) - Documentation overview
- [`workshop/ARCHITECTURE.md`](workshop/ARCHITECTURE.md) - Design decisions
