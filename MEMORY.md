# EffectFlow - Tutor Memory

## Current Phase
**Phase 1**: Lazy Evaluation and Success/Failure

## Progress

### Completed
- [x] TraceStore created (`src/stores/traceStore.tsx`)
- [x] App wrapped with TraceStoreProvider
- [x] ExecutionLog wired to display events with color coding

### In Progress
- [ ] User task: Implement `withTrace()` using Service + Layer pattern

## Design Decisions
- Using **Service + Layer** pattern for TraceEmitter (not callbacks)
- Introduces the R channel (Requirements) early in learning
- `TraceEmitter` service with `emit(event)` method
- `makeTraceEmitterLayer` bridges Effect world to React state

### Next Steps
- [ ] Concept lesson: Effect as a lazy data structure
- [ ] Implement `runWithTrace()` - first instrumented runner

## Key Files
- `src/types/trace.ts` - TraceEvent type definitions
- `src/stores/traceStore.tsx` - Event state management
- `src/components/visualizer/ExecutionLog.tsx` - Event display (to be wired)

## Learning Phases
1. **Phase 1**: Lazy evaluation, success/failure channels (current)
2. **Phase 2**: Fibers, fork/join, interruption
3. **Phase 3**: Scheduling, delays, suspended fibers
4. **Phase 4**: Errors, retries, supervision
5. **Phase 5**: Scopes, resources, finalizers
