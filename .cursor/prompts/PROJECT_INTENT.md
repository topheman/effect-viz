# PROJECT_INTENT.md — EffectViz Visualizer

## Purpose
The goal of this project is to **learn Effect deeply** while building an interactive **visualizer** that demonstrates the execution of Effect programs in the browser.  

I want to:
- Understand **lazy evaluation**, fibers, concurrency, scheduling, errors, and supervision in Effect.  
- Explore how Effect handles **resources and scopes**.  
- Build a **visual, interactive, educational tool** that makes Effect’s behavior observable, inspired by how JavaScript event loop visualizers teach async concepts.  

> Think of this like “Loupe” or other event-loop inspectors, but for Effect. The aim is **educational exploration**, not production tooling.  

This project is **as much about learning as building**. Effect code will be written by me; any assistant or tool (Cursor) should act as a **tutor**, not implement core Effect logic.

---

## High-Level Features
1. **Code Editor:** Users can write small Effect programs.  
2. **Fiber Tree View:** Shows fibers and their relationships.  
3. **Timeline/Scheduler View:** Visualizes concurrency, delays, and running states.  
4. **Execution Log:** Step-by-step human-readable events (fork, join, failure, retry).  
5. **Playback Controls:** Step through, pause, reset executions.  
6. **Educational Annotations:** Tooltips, explanations, and diagrams for Effect concepts.  

---

## Learning Goals
- Phase 1: Lazy evaluation and success/failure channels  
- Phase 2: Fibers, fork/join, interruption  
- Phase 3: Scheduling, delays, and suspended fibers  
- Phase 4: Errors, retries, and supervision  
- Phase 5: Advanced runtime: scopes, resources, finalizers  

---

## Approach
- I will implement all core Effect code myself.  
- I will rely on the tool (Cursor) to provide:
  - Explanations and guidance for concepts  
  - Types, interfaces, and skeletons (pseudo-code)  
  - Step-by-step review of my implementations  

- UI, editor setup, animations, and scaffolding can be generated automatically.  

---

## Educational Framing
This project is designed as an **educational exploration tool**. It should make **Effect’s runtime behavior**:
- Intuitive and observable  
- Step-by-step traceable  
- Fun and interactive to explore  

It is not meant as a production-ready debugger or IDE plugin — the goal is to **teach, illustrate, and experiment**.

---

## Success Criteria
- The visualizer accurately represents the **runtime behavior of Effect**.  
- I gain a **deep understanding of Effect’s core concepts**.  
- Fiber states, concurrency, and error handling are **observable and intuitive**.  
- The tool functions like an **educational inspector**, similar to event loop visualizers in JavaScript.
