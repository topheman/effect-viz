# WebContainer Integration

This folder documents the WebContainer integration for EffectViz — running edited programs in a WebContainer and streaming trace events back to the host for visualization.

## Documents

| Document | Purpose |
|----------|---------|
| [webcontainers-spec.md](./webcontainers-spec.md) | Full specification: boot sequence, project structure, sync model, stdout protocol, editor behavior |
| [webcontainer-impl.md](./webcontainer-impl.md) | Phased implementation plan (headers, tracedRunner bundle, Effect services, sync, spawn, types) |
| [webcontainer-perf-and-sync.md](./webcontainer-perf-and-sync.md) | Pre-compile (esbuild-wasm), sync UX (500ms debounce, flush-on-Play), perf instrumentation, remaining todos |
| [MOBILE_FALLBACK.md](./MOBILE_FALLBACK.md) | Mobile fallback when WebContainer fails to boot (readonly editor, in-browser Effect) |

## Quick Context

- **Goal:** Editable Program tab → on Play, run in WebContainer → stream `TRACE_EVENT` lines to host → same ExecutionLog + FiberTreeView
- **Necessary for v2:** WebContainer + editable editor must be in place before refactoring to runtime hooks (Phase 6+)
