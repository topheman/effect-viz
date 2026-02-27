# Phase 7: Custom Tracer for Effect.withSpan

## Concepts

### Effect's Tracer as Runtime Service

Effect's **Tracer** is a service. When you use `Effect.withSpan("name")(effect)`, the runtime creates a span via `Tracer.span(...)` and calls `span.end(endTime, exit)` when the effect completes. A custom Tracer can emit our TraceEvents—no TraceEmitter in the R channel.

### Tracer.make

`Tracer.make(options)` creates a custom Tracer. You implement:
- **span**: Called when `Effect.withSpan` runs; receives name, parent, context, links, startTime, kind, options. Emit `effect:start`, return a Span object with `end(endTime, exit)` that emits `effect:end`.
- **context**: Context propagation hook; for viz, `return f()` is sufficient.

### Layer.setTracer

`Layer.setTracer(tracer)` provides the Tracer to the runtime. The runner merges it with Supervisor and other layers.

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/vizTracer.ts` | `makeVizTracer(onEmit)` returns `Tracer.make({ span, context })`; span emits effect:start on creation, effect:end in `end()`; forwards parent, context, links, kind, options |
| `src/hooks/useEventHandlers.ts` | Adds `Layer.setTracer(makeVizTracer(onEmit))` to merged layers |
| `src/services/webcontainer.ts` | RUNNER_JS: adds tracerLayer to layer merge |
| `src/lib/programs.ts` | Migrated all programs from `withTrace(effect, "label")` to `Effect.withSpan("label")(effect)`; updated source strings |
| `src/runtime/tracedRunner.ts` | Removed `withTrace` |
| `src/runtime/index.ts` | Removed `withTrace` export |

### Key Functions

```typescript
// makeVizTracer: returns a Tracer that emits effect:start/effect:end to onEmit
export function makeVizTracer(onEmit: (event: TraceEvent) => void): Tracer.Tracer

// User code: Effect.withSpan("label")(effect) — standard Effect API
yield* Effect.withSpan("step-1")(Effect.succeed(42));
```

### Span Fields

The Span returned from `span()` must implement the full interface: name, spanId, traceId, parent, context, status, attributes, links, sampled, kind, and end/attribute/event/addLinks. Forward parent, context, links, kind from parameters; use `options?.attributes` for attributes.

## Key Learnings

### Effect.withSpan vs withTrace

Same ergonomics (wrap effect with label), but `Effect.withSpan` is the standard Effect API. No TraceEmitter in R—the Tracer is provided by the runner via layers.

### Timestamps

Effect's Tracer uses bigint (nanoseconds) for startTime/endTime. For TraceEvent we use `Date.now()` for consistency with other events (fiber:fork, etc.).

### Thin Wrappers Remain

`retryWithTrace`, `addFinalizerWithTrace`, `acquireReleaseWithTrace`, `sleepWithTrace` still use TraceEmitter—no built-in replacement. `makeTraceEmitterLayer` stays for those.

## Example Programs (Migrated)

All programs now use `Effect.withSpan("label")(effect)`:
- **Basic**, **Multi-Step**, **Nested Forks**, **Racing**, **Failure & Recovery**, **Basic Finalizers**, **Acquire Release**, **Logger with Requirements**

## What's Next

**Phase 8: Sleep Visibility** will cover:
- Supervisor `onSuspend`/`onResume` for suspended fiber state
- TimelineView suspend/resume segments
