# Phase 1: Lazy Evaluation and Success/Failure

## Concepts

- **Effect is lazy**: An `Effect<A, E, R>` is a description, not execution
- **Three type parameters**: Success (`A`), Error (`E`), Requirements (`R`)
- **Services via Context.Tag**: Dependency injection the Effect way
- **Layers provide implementations**: Bridge Effect world to React world

## Implementation

### Created Files

- `src/stores/traceStore.tsx` - React Context for trace events
- `src/runtime/tracedRunner.ts` - `TraceEmitter` service + `withTrace()`
- `src/components/visualizer/ExecutionLog.tsx` - Event display

### Key Functions

```typescript
// Service definition
export class TraceEmitter extends Context.Tag("TraceEmitter")<...>() {}

// Wrap effect to emit events
export const withTrace = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string
): Effect.Effect<A, E, R | TraceEmitter>

// Bridge to React
export const makeTraceEmitterLayer = (
  onEmit: (event: TraceEvent) => void
): Layer.Layer<TraceEmitter>
```

## Learning Outcomes

- Effect values are just data structures until `Effect.runPromise`
- The R channel (Requirements) is Effect's dependency injection
- `Context.Tag` defines a service "slot"
- `Layer.succeed` provides a service implementation
- `Effect.sync` wraps synchronous side effects

## Test

Run `Effect.succeed("Hello")` wrapped with `withTrace` - see `effect:start` and `effect:end` events in the log.
