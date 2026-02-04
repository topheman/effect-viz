# Phase 5: Scopes and Resources

## Concepts

### Scopes and Resource Lifetime

In Effect, a **scope** defines the lifetime during which a resource is valid. When the scope closes (success, failure, or interruption), cleanup runs. Resources are acquired, used, and released; release must run in all exit cases—that's what finalizers guarantee.

### Effect.addFinalizer (the primitive)

`addFinalizer(finalizer)` registers an effect to run when the current scope closes. This is the lowest-level primitive: `acquireRelease` is typically implemented in terms of scope + addFinalizer. Finalizers run in **LIFO** order (last registered runs first).

### Effect.acquireRelease

`acquireRelease(acquire, release)` runs `acquire` to get a resource, then runs your effect with that resource. When the effect exits (any reason), `release` runs. The finalizer receives the exit (success/failure/interrupt) so it can adapt.

### When Finalizers Run

- **Success**: after the inner effect succeeds, the finalizer runs.
- **Failure**: after the inner effect fails, the finalizer runs, then the failure propagates.
- **Interruption**: when the fiber is interrupted, the finalizer runs, then the interrupt propagates.
- **Ordering**: nested scopes run inner finalizers before outer (LIFO).

## Implementation

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/types/trace.ts` | `FinalizerEvent` (id, label, timestamp); `AcquireEvent` (success/failure with id, label, result, error?, timestamp) |
| `src/runtime/tracedRunner.ts` | `emitFinalizer`, `emitAcquire`, `addFinalizerWithTrace`, `acquireReleaseWithTrace` (built on addFinalizerWithTrace) |
| `src/lib/programs.ts` | `basicFinalizersExample` (3 finalizers, LIFO demo), `acquireReleaseExample`; both run inside `Effect.scoped` |
| `src/components/visualizer/ExecutionLog.tsx` | `finalizer` and `acquire` cases: "Finalizer ran: &lt;label&gt;", "Resource acquired" / "Resource acquire failed" |

### Key Functions

- **emitFinalizer(id, label)** — Emits `FinalizerEvent`; requires TraceEmitter.
- **emitAcquire(id, label, result, error?)** — Emits `AcquireEvent` (success or failure); requires TraceEmitter.
- **addFinalizerWithTrace(finalizer, label)** — Wraps `Effect.addFinalizer`: when the finalizer runs, emit FinalizerEvent then run the user's finalizer. Requires TraceEmitter, Scope.
- **acquireReleaseWithTrace(acquire, release, label)** — Acquire → emit acquire event (via onExit) → register release with addFinalizerWithTrace (label "release: …") → return resource. Built on the primitive. Requires TraceEmitter, Scope.

### Event Model

- **FinalizerEvent** — Single event type for "a finalizer ran"; the `label` indicates meaning (e.g. "cleanup", "finalizer-1", "connection:release").
- **AcquireEvent** — Tracks acquire outcome (success/failure) so the log can show "Resource acquired" vs "Resource acquire failed". Release is represented by a FinalizerEvent with a release-style label.

## Key Learnings

### Accessing Services Inside addFinalizer

The callback you pass to `Effect.addFinalizer` must **return** an Effect, not run it. Build that effect (e.g. with `Effect.gen`) so it first emits the event, then runs the user's finalizer. When the runtime runs that effect at scope exit, it provides the environment (TraceEmitter, etc.).

### LIFO Order

Registering three finalizers in order 1, 2, 3 produces execution order 3, 2, 1 when the scope closes. The Basic Finalizers program demonstrates this in the ExecutionLog.

### Effect.scoped

Programs that use finalizers need a scope. Use **Effect.scoped(effect)** to run an effect with a scope; when the effect completes, the scope closes and all registered finalizers run.

## Example Programs

- **Basic Finalizers** (`basicFinalizers`): Registers three finalizers ("finalizer-1", "finalizer-2", "finalizer-3"), runs two traced steps, then exits. Log shows steps then "Finalizer ran: finalizer-3", "finalizer-2", "finalizer-1" (LIFO).
- **Acquire / Release** (`acquireRelease`): Uses `acquireReleaseWithTrace` to acquire a dummy connection, run a traced "use-connection" step, then scope closes. Log shows "Resource acquired: connection", use step, then "Finalizer ran: connection:release".

## What's Next

**Version 2 (future)**: Runtime hooks—Supervisor for fiber lifecycle, Tracer for spans, custom Clock/Scheduler for suspension. See workshop README.
