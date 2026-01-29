# EffectFlow - Tutor Memory

## Current Phase
**Phase 2**: Fibers, Fork/Join, Interruption

## Completed Phases

### Phase 1: Lazy Evaluation and Success/Failure
- [x] TraceStore (`src/stores/traceStore.tsx`)
- [x] ExecutionLog wired with color-coded events
- [x] `TraceEmitter` service + `makeTraceEmitterLayer`
- [x] `withTrace()` using Service + Layer pattern
- [x] Play button wired via `useEventHandlers` hook

## Phase 2 Progress

### Completed
- [x] FiberStore with processEvent (fork, end, interrupt)
- [x] buildFiberTree recursive function
- [x] `forkWithTrace` using Effect's real FiberId
- [x] `runProgramWithTrace` for root fiber tracking
- [x] Parent-child relationships via FiberId.threadName
- [x] FiberTreeView wired to display fiber hierarchy

### Key Learning
- `Effect.fiberId` returns the current fiber's ID
- `FiberId.threadName(id)` converts to readable string (e.g., "#1")
- `fiber.id()` gets a forked fiber's ID

## Design Decisions
- **Service + Layer** pattern for TraceEmitter
- R channel (Requirements) introduced early
- `makeTraceEmitterLayer` bridges Effect to React

## Key Files
- `src/types/trace.ts` - TraceEvent definitions
- `src/stores/traceStore.tsx` - Event state
- `src/runtime/tracedRunner.ts` - Instrumented runner
- `src/hooks/useEventHandlers.ts` - Play button handler
- `src/components/visualizer/ExecutionLog.tsx` - Event log
- `src/components/visualizer/FiberTreeView.tsx` - Fiber tree (TODO)

## Learning Phases
1. ~~**Phase 1**: Lazy evaluation, success/failure~~ (complete)
2. **Phase 2**: Fibers, fork/join, interruption (current)
3. **Phase 3**: Scheduling, delays, suspended fibers
4. **Phase 4**: Errors, retries, supervision
5. **Phase 5**: Scopes, resources, finalizers
