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

```ts
type TraceEvent =
  | { type: "effect:start"; id: string; label: string }
  | { type: "effect:end"; id: string; result: "success" | "failure" }
  | { type: "fiber:fork"; fiberId: string; parentId?: string }
  | { type: "fiber:end"; fiberId: string }
  | { type: "fiber:interrupt"; fiberId: string }
  | { type: "fiber:suspend"; fiberId: string; duration: number }
  | { type: "sleep:end"; fiberId: string }
```

## Context Recovery (For Fresh Sessions)

Invoked by the `/resume` skill (Claude Code) at the start of a fresh session.

**ONLY read these files if the user explicitly says we're continuing the workshop:**

1. **[`MEMORY.md`](MEMORY.md)** ⭐ **START HERE**
   - Current phase and progress
   - What's completed, what's next
   - Key files and learning outcomes

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

## Tech stack

This project is based on a custom template relying on the following stack:

- React 19 (with react-compiler)
- Vite 7
- TypeScript 5.9
- Tailwind CSS 4
- Testing: Vitest + React Testing Library
- Linting: ESLint with:
  - Prettier configured as a plugin
  - Better Tailwind CSS integration
  - Testing Library integration
  - Import plugin

All those are properly configured. Take advantage of it.

## Guidelines

- ALWAYS ASK FOR CONFIRMATION before installing a new dependency.
- TypeScript and Eslint is properly configured. Take advantage of it.
  - `npm run lint`: runs eslint
  - `npm run lint:fix`: auto fixes eslint errors
- vitest, a test runner, is properly configured with react-testing-library. Take advantage of it. Write tests for your code.
  - `npm run test`: runs tests
- Use tailwind 4 for styling unless you are told otherwise.
- Format on save is enabled.
- Git hooks are enabled.
- DO NOT LAUNCH a new dev server on your own. I will do it for you, it will be available at `http://localhost:5173`.
