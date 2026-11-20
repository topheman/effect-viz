# EffectViz

A web-based visualizer for Effect.ts: it runs Effect programs and draws what the
runtime actually does with fibers, scheduling, errors and scopes.

You can read the project intent [here](.cursor/prompts/PROJECT_INTENT.md).

## How We Work

We pair on this project. I am here to learn Effect deeply, and you write the
implementation. Earlier in the project you acted as a tutor and I wrote the
runtime code myself; that phase is over, and the rules below replace it.

- **Explain the concept before you build.** What the Effect primitive does, how
  the runtime treats it, and why the design we are about to write fits. Diagrams,
  timelines and mental models are welcome.
- **Explain what you built afterwards.** Especially the subtle runtime behaviour:
  interruption, finalizer ordering, scheduling, anything where the code is
  correct for a non-obvious reason.
- **Ask before large refactors.** Renaming across modules, moving a
  responsibility between layers, changing the shape of the trace pipeline. Small
  local cleanups as you go are fine.
- **Prefer idiomatic Effect.** If there is a combinator for what we are hand
  rolling, say so.
- Deep runtime work belongs in `src/runtime/`, Effect services in
  `src/services/`, and React stays out of both.

## Trace Event Model

`src/types/trace.ts` holds the full type. Every event also carries a
`timestamp`, in virtual milliseconds from the program's `Clock`. The tracer
(`src/runtime/vizTracer.ts`) emits the span and fiber events; the
`retryWithTrace`, `addFinalizerWithTrace` and `acquireReleaseWithTrace` wrappers
(`src/runtime/tracedRunner.ts`) emit `retry:attempt`, `finalizer` and `acquire`.

```ts
type TraceEvent =
  | { type: "effect:start"; id: string; fiberId: string; label: string }
  | { type: "effect:end"; id: string; fiberId: string; result: "success"; value: unknown }
  | { type: "effect:end"; id: string; fiberId: string; result: "failure"; error: unknown }
  | { type: "effect:end"; id: string; fiberId: string; result: "interrupted" }
  | { type: "fiber:fork"; fiberId: string; parentId?: string; label: string }
  | { type: "fiber:end"; fiberId: string; result: "success" | "failure" }
  | { type: "fiber:interrupt"; fiberId: string }
  | { type: "fiber:suspend"; fiberId: string; reason: SuspendReason }
  | { type: "fiber:resume"; fiberId: string }
  | { type: "retry:attempt"; id: string; fiberId: string; label: string; attempt: number; lastError: unknown }
  | { type: "finalizer"; id: string; fiberId: string; label: string }
  | { type: "acquire"; id: string; fiberId: string; label: string; result: "success" }
  | { type: "acquire"; id: string; fiberId: string; label: string; result: "failure"; error: unknown }

type SuspendReason =
  | { kind: "yield" }
  | { kind: "sleep"; duration: number }
  | { kind: "wait" }
```

## Context Recovery (For Fresh Sessions)

Invoked by the `/resume` skill (Claude Code) at the start of a fresh session.

**ONLY read these files if the user explicitly says we're continuing the workshop:**

1. **[`MEMORY.md`](MEMORY.md)** ⭐ **START HERE**
   - Current phase and progress
   - What's completed, design decisions
   - Key files (learning outcomes live in each `workshop/phase-N.md`)

2. **[`workshop/README.md`](workshop/README.md)**
   - Documentation structure
   - Links to all phase docs
   - Overall approach

3. **[`workshop/ARCHITECTURE.md`](workshop/ARCHITECTURE.md)**
   - Why Service + Layer pattern
   - Why real FiberIds
   - File structure and key patterns

4. **[`workshop/phase-N.md`](workshop/)** (for completed phases)
   - Concepts explored
   - Implementation details
   - Learning outcomes

**Quick reference:**

- Current phase? → `MEMORY.md` "Current Phase" section
- Architecture decisions? → `workshop/ARCHITECTURE.md`
- What was built? → `workshop/phase-N.md` for that phase

When completing a phase, create a phase document in `workshop/`:

- `workshop/phase-N.md` - Document concepts, implementation, and learning outcomes
- See `workshop/README.md` for the documentation structure
- Update `workshop/README.md` to mark the phase as complete
- Update the "Current Phase" section of `MEMORY.md`

All four land in the same commit as the phase itself. A phase is not done until
its write-up is in the diff.

## Tech stack

This project is based on a custom template relying on the following stack:

- React 19 (with react-compiler)
- Vite+ (Vite 8, Vitest, Oxlint, Oxfmt), configured in `vite.config.ts`
- TypeScript 7, with the Effect language service and diagnostics from `@effect/tsgo`
- Tailwind CSS 4
- Testing: Vitest + React Testing Library
- Linting: Oxlint, type-aware, with:
  - React hooks and React Compiler rules
  - Better Tailwind CSS and Testing Library as JS plugins
- Formatting: Oxfmt, which also sorts imports

All those are properly configured. Take advantage of it.

## Guidelines

- ALWAYS ASK FOR CONFIRMATION before installing a new dependency.
- TypeScript and Oxlint are properly configured. Take advantage of it.
  - `pnpm run check`: formats, lints, runs the Effect diagnostics and type checks (`effect-tsgo vp check`; a bare `vp check` cannot load the Effect rules)
  - `pnpm run lint:fix`: auto fixes lint errors
  - `pnpm run format`: formats the code
- Vitest, a test runner, is properly configured with react-testing-library. Take advantage of it. Write tests for your code.
  - `pnpm run test`: runs tests
  - Test files import from `vite-plus/test`, not `vitest`.
- Use tailwind 4 for styling unless you are told otherwise.
- Format on save is enabled.
- Git hooks are enabled.
- DO NOT LAUNCH a new dev server on your own. I will do it for you, it will be available at `http://localhost:5173`.
