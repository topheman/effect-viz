# EffectViz Workshop Documentation

This folder contains documentation for the EffectViz visualizer learning journey.

## Purpose

- **For AI**: Quick context recovery - understand where we are and what's been built
- **For You**: Reference documentation of the learning journey

## Key Files

- [`MEMORY.md`](../MEMORY.md) - Current progress and state (updated frequently)
- [`AGENTS.md`](../AGENTS.md) - Project rules and teaching approach
- [`PROJECT_INTENT.md`](../.cursor/prompts/PROJECT_INTENT.md) - Original project goals

## Phase Documentation

Each phase document covers:
- **Concepts**: What Effect features were explored
- **Implementation**: What was built
- **Key Files**: Important code changes
- **Learning Outcomes**: What you learned

### Version 1: Manual Instrumentation

Learn Effect concepts through explicit tracing wrappers (`withTrace`, `forkWithTrace`, etc.)

- [Phase 1: Lazy Evaluation](./phase-1.md) ✅
- [Phase 2: Fibers](./phase-2.md) ✅
- [Phase 3: Scheduling & Delays](./phase-3.md) ✅
- [Phase 4: Errors & Retries](./phase-4.md) ✅
- [Phase 5: Scopes & Resources](./phase-5.md) ✅

### Version 2: Runtime Hooks (Future)

Refactor to use Effect's built-in observability, removing manual wrappers.

- Phase 6: Supervisor for automatic fiber lifecycle tracking
- Phase 7: Tracer integration for effect spans
- Phase 8: Custom Clock/Scheduler for suspension visibility

**Why two versions?**
- **V1** teaches concepts explicitly - you see exactly what gets traced
- **V2** teaches Effect's production observability patterns
- The conceptual knowledge from V1 transfers directly to understanding V2

## Approach

1. **Scaffold, don't implement** - AI provides structure, you implement Effect logic
2. **Service + Layer pattern** - Effect's dependency injection (R channel)
3. **Real FiberIds** - Use Effect's runtime IDs, not custom abstractions
4. **Event-driven visualization** - TraceEvents bridge Effect runtime to React UI

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions.

## WebContainers: Editable Programs

WebContainer integration docs live in [WebContainer/](./WebContainer/):

- [webcontainers-spec.md](./WebContainer/webcontainers-spec.md) - Specification for running edited programs in a WebContainer (boot on mount, install sequence, root vs inner project structure). This step is **necessary for v2** — the editable editor and WebContainer runtime must be in place before refactoring to runtime hooks.
- [webcontainer-impl.md](./WebContainer/webcontainer-impl.md) - Phased implementation plan (Effect services, sync, spawn).
- [MOBILE_FALLBACK.md](./WebContainer/MOBILE_FALLBACK.md) - Mobile fallback path (readonly editor, in-browser Effect execution) when WebContainer doesn't boot.
- [webcontainer-perf-and-sync.md](./WebContainer/webcontainer-perf-and-sync.md) - Pre-compile optimization, sync UX (500ms debounce, flush-on-Play, Syncing...), perf instrumentation, and remaining todos (stdout→WebContainerLogsPanel).
