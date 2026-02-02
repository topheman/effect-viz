# EffectFlow - Tutor Memory

**Quick Context**: See [`workshop/README.md`](workshop/README.md) for full documentation.

## Current Phase
**Phase 3**: COMPLETE ✅

**Recent**: Implemented sleep tracing, real-time timeline visualization

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

### Key Learning (Phase 3)
- Fibers **suspend** (yield control) rather than block
- Cooperative scheduling: fibers yield at suspension points
- `Duration.decode()` converts DurationInput to Duration
- `Effect.race` on `Fiber.join` calls for traceable racing
- Manual instrumentation limitations vs runtime hooks

## Design Decisions
- **Service + Layer** pattern for TraceEmitter
- R channel (Requirements) introduced early
- `makeTraceEmitterLayer` bridges Effect to React
- **Manual wrappers** for V1 (explicit, educational)
- **Runtime hooks** planned for V2 (automatic, production-ready)

## Key Files
- `src/types/trace.ts` - TraceEvent definitions (includes sleep events)
- `src/stores/traceStore.tsx` - Event state
- `src/stores/fiberStore.tsx` - Fiber state (handles suspension)
- `src/runtime/tracedRunner.ts` - Instrumented runner (`withTrace`, `forkWithTrace`, `sleepWithTrace`)
- `src/hooks/useEventHandlers.ts` - Play/Reset handlers with program selection
- `src/components/visualizer/ExecutionLog.tsx` - Event log
- `src/components/visualizer/FiberTreeView.tsx` - Fiber tree with suspended indicator
- `src/components/visualizer/TimelineView.tsx` - Real-time timeline visualization
- `src/lib/programs.ts` - Example programs with source code

## Learning Phases
1. ~~**Phase 1**: Lazy evaluation, success/failure~~ ✅ See [`workshop/phase-1.md`](workshop/phase-1.md)
2. ~~**Phase 2**: Fibers, fork/join, interruption~~ ✅ See [`workshop/phase-2.md`](workshop/phase-2.md)
3. ~~**Phase 3**: Scheduling, delays, suspended fibers~~ ✅ See [`workshop/phase-3.md`](workshop/phase-3.md)
4. **Phase 4**: Errors, retries, supervision (next)
5. **Phase 5**: Scopes, resources, finalizers

## Documentation
- [`workshop/README.md`](workshop/README.md) - Documentation overview
- [`workshop/ARCHITECTURE.md`](workshop/ARCHITECTURE.md) - Design decisions
