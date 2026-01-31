# EffectFlow Workshop Documentation

This folder contains documentation for the EffectFlow visualizer learning journey.

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

- [Phase 1: Lazy Evaluation](./phase-1.md) ✅
- [Phase 2: Fibers](./phase-2.md) ✅
- Phase 3: Scheduling & Delays (not started)
- Phase 4: Errors & Retries (not started)
- Phase 5: Scopes & Resources (not started)

## Approach

1. **Scaffold, don't implement** - AI provides structure, you implement Effect logic
2. **Service + Layer pattern** - Effect's dependency injection (R channel)
3. **Real FiberIds** - Use Effect's runtime IDs, not custom abstractions
4. **Event-driven visualization** - TraceEvents bridge Effect runtime to React UI

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions.
