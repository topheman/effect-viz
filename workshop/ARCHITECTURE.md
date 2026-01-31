# EffectFlow Architecture

## Design Decisions

### Why Service + Layer Pattern?

Instead of callbacks, we use Effect's **Service** pattern:
- `TraceEmitter` service defined with `Context.Tag`
- `makeTraceEmitterLayer` provides implementation
- Effects explicitly require `TraceEmitter` in their R channel
- **Benefit**: Teaches Effect's dependency injection early

### Why Real FiberIds?

We use `Effect.fiberId` and `FiberId.threadName()` instead of custom UUIDs:
- Effect already tracks parent-child relationships
- No need to reinvent fiber tracking
- **Benefit**: Accurate visualization of Effect's actual runtime

### Event-Driven Visualization

```
Effect Runtime → TraceEvents → TraceStore → React UI
```

- `TraceEvent` types define the contract
- `TraceEmitter` service emits events
- Stores (`TraceStore`, `FiberStore`) process events
- UI components consume stores

## File Structure

```
src/
├── runtime/
│   └── tracedRunner.ts      # Effect tracing utilities
├── stores/
│   ├── traceStore.tsx       # Event state (for ExecutionLog)
│   └── fiberStore.tsx       # Fiber state (for FiberTreeView)
├── components/
│   ├── visualizer/
│   │   ├── ExecutionLog.tsx # Shows trace events
│   │   └── FiberTreeView.tsx # Shows fiber hierarchy
│   └── editor/
│       └── CodeEditor.tsx    # Monaco editor (readonly for now)
├── lib/
│   └── programs.ts          # Example programs with source
└── hooks/
    └── useEventHandlers.ts # Play/Reset button logic
```

## Key Patterns

### Tracing an Effect

```typescript
const traced = withTrace(effect, "label");
// Returns: Effect<A, E, R | TraceEmitter>
```

### Forking with Tracing

```typescript
const fiber = yield* forkWithTrace(effect, "fiber-label");
// Emits: fiber:fork, fiber:end (or fiber:interrupt)
```

### Running a Program

```typescript
const traced = runProgramWithTrace(program, "main");
const layer = makeTraceEmitterLayer(addEvent);
Effect.runFork(traced.pipe(Effect.provide(layer)));
```
