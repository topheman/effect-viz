# Migrating to Effect 4

Phases 1 to 11 were built on Effect 3, and the visualizer draws what that runtime does: which fibers it forks, when it suspends them, how it interrupts them and in what order it runs their finalizers. Effect 4 is a new major version of that runtime, so this document records, primitive by primitive, what changed underneath the visualizer and what the migration changed in `src/runtime/` and in the traces as a result.

## One version, on both paths

The in-browser path bundles the `effect` this repo depends on, and the WebContainer installs its own copy from the `package.json` that `src/services/webcontainer.ts` mounts, pinned to the same version through `__EFFECT_VERSION__`. Both paths therefore move to Effect 4 together, and the runner script (`RUNNER_JS`) imports the same `withViz` and `runProgramFork` from the bundled `runtime.js` that the browser path calls, so neither path can drift from the other.

The editor's type information moves too. Effect 4's declarations sit directly in `dist/` and weigh about 7.6 MiB, so `effect-types.json` grows past the service worker's 2 MiB precache default and the limit goes up to 10 MiB. The folders Effect 4 adds under `dist/` (`http`, `cli`, `cluster`, `ai` and the like) are not bundled: no example imports them, and they would add another 4.5 MiB.

## Running a program

`withViz` in `runProgram.ts` wraps the program in every service the visualizer needs, and `runProgramFork` starts the result with `Effect.runFork` and turns its exit into a promise. The services are plain `Effect.provideService` calls: Effect 4 reads the `Scheduler`, `Clock` and `Tracer` from the fiber's context, so there is no `withScheduler`, `Layer.setClock` or `Supervisor` to install any more. The tracer is outermost, so it sees the root fiber's very first primitive, before any layer is built.

Fibers are numbered by a single global counter: `fiber.id` is a number, and the visualizer prints it as `#N`. A fresh WebContainer process starts its root at `#1`; the in-browser path carries on from whatever the page has already run.

## Fibers and the Supervisor

Effect 4 has no `Supervisor`. What it has is `Tracer.context`: before evaluating a primitive, the run loop hands it to the tracer together with the fiber evaluating it, and the tracer evaluates it itself. `fiberLifecycle.ts` builds the whole fiber lifecycle out of that stream:

- A fiber seen for the first time is a fork. When the primitive that returned it was a public fork (`forkChild`, `forkDetach`, `forkIn`, `forkScoped`), the parent is the fiber that ran it. When the runtime forks it from inside one of its own operators (`race`, `forEach` with concurrency, parallel finalizers), the child starts running synchronously, inside its parent's primitive, so the parent is the fiber still on the stack. An operator can also start a fiber with no fiber on the stack: `forEach` starts its next worker from the observer of the one that ended. A child starts with its parent's `Context`, so that worker's parent is the fiber that last forked with the same `Context`.
- A primitive that returns the run loop's `Yield` sentinel stops the fiber: that is a suspend, and the fiber's next primitive is its resume. A fiber that is done yields its `Exit` instead, which is not a suspend: the runtime may evaluate it once more, to interrupt the children it leaves, before it ends.
- `fiber.addObserver` reports the end, as `fiber:end` on success and `fiber:interrupt` otherwise.

The root needs no special case any more. It is simply the one fiber discovered with no parent, and it is already running when it is discovered, so its trace starts with a fork and no resume.

Fibers that build the program's layers are still left out. Under Effect 3 they were the fibers whose context held nothing but the layer memo map. In Effect 4 the context a layer provides carries that memo map too, so the program's own fibers would match as well. `withViz` instead sets an `InProgram` reference to `false` around the layer build only, and the tracer leaves out every fiber whose context carries it, with or without a parent.

## Scheduling

Effect 4's `Scheduler` makes one dispatcher per fiber, takes continuations as tasks through `scheduleTask`, and answers `shouldYield` before each operation. `GatedScheduler` owns both: playing, it forwards everything to Effect's `MixedScheduler`; paused, it queues tasks and answers `shouldYield` with yes, so every fiber, whatever woke it, runs one operation and hands itself back to the queue.

That forced yield is invisible to the tracer: the run loop schedules the continuation without going through `Tracer.context`, so it is neither a suspend nor a resume. It does change the order of the queue, though. At full speed the yielding fiber would have kept running, so `GatedScheduler` puts its continuation ahead of the tasks already waiting, and stepping a paused program shows the same order as playing it. A step still releases tasks until the trace moves, and advances virtual time when nothing is runnable.

## Time and sleep

`vizClock.ts` implements Effect 4's `Clock` (`currentTimeMillisUnsafe`, `currentTimeNanosUnsafe`, `sleep`) on top of `virtualClock.ts`. A sleeping fiber suspends on an `Effect.callback` whose resume the virtual clock fires, through `GatedScheduler.wake`, so a timer that expires while paused only queues the fiber. The `Date` shim the WebContainer installs reads the same clock through `currentTimeMillisUnsafe`.

## Interruption

Interruption is now synchronous. `Fiber.interrupt` calls the target's `interruptUnsafe`, and when the target is suspended it evaluates the interruption right there, inside the interrupting fiber's primitive. The target unwinds, runs its finalizers and interrupts its own children before `Fiber.interrupt` returns, so the interrupter never suspends to wait for it. In the trace, the interrupted fiber resumes, unwinds and ends while its interrupter is still running, and the interrupter carries on without a resume of its own.

An interrupted fiber still ends with `fiber:interrupt`. One fiber ends differently, though: `Effect.timeout` now races the work against the deadline, so a work fiber that misses its deadline is interrupted and ends with `fiber:interrupt`, where Effect 3 reported it as ended.

## Scopes and finalizers

`Scope`, `Effect.acquireRelease` and `Effect.addFinalizer` keep their meaning, and `acquireReleaseWithTrace` and `addFinalizerWithTrace` wrap them unchanged. Finalizers still run in reverse order of registration, and every example traces the same `finalizer` and `acquire` rows as before.

## Retries

`Schedule.driver` is gone. `retryWithTrace` steps through the schedule with `Schedule.toStepWithSleep`, which consumes one error, sleeps for the delay the schedule computed and fails once the schedule is done. That sleep happens even when the delay is zero, as with `Schedule.recurs`, and a zero sleep still suspends the fiber until the clock fires it. Each retry without a delay therefore shows a suspend and a resume between two attempts, which Effect 3 skipped.

## Tracing

`Tracer.make` takes the same `span` function as before, and `vizTracer.ts` still turns each `Effect.withSpan` into an `effect:start` and an `effect:end`, stamped with the clock the runtime passes in. The spans the Execution Log shows are unchanged in every example. The tracer now also provides `context`, which is where the fiber lifecycle comes from (see [Fibers and the Supervisor](#fibers-and-the-supervisor)).

## The examples, before and after

Every example was run under both versions with the same virtual clock, and the traces compared with fiber ids renumbered by first appearance. All fifteen still end the way they did, and their spans, retries, finalizers and acquisitions are the same. What differs is the fiber rows, for these reasons:

- **An ended fiber no longer suspends.** Effect 3's `Supervisor` reported a `fiber:suspend` right after every `fiber:end`. The yield that ends a fiber is not a suspension, and the tracer drops it. Every example with a forked fiber loses those rows.
- **The root starts running.** The root is discovered on its first primitive, so its trace opens with its fork and no resume.
- **A joiner resumes inside its child's exit.** When a child ends, the fiber joining it runs from the child's observer, in the same turn, rather than being scheduled. `interleaving`, `racing` and `timeout` lose the extra suspend and resume pairs the root went through while it waited, and in `interleaving` the root takes its turn before B ends rather than after.
- **An operator's own forks start at once.** `race`, `timeout` and `Effect.all` with concurrency start each child synchronously, inside the parent's primitive. In `racing` the two fibers `race` forks resume and suspend as soon as they are forked; in `timeout` the work starts before the deadline fiber is even forked; in `boundedConcurrency` task 1 starts before task 2 is forked.
- **`Effect.all` forks one fiber per element.** `boundedConcurrency` used to fork a coordinator and two workers that each ran several tasks. It now forks the five tasks straight from the root, two alive at a time, and each task's fiber ends when its task does.
- **The timeout's work fiber is interrupted.** In `timeout`, the slow task's fiber ends with `fiber:interrupt` instead of `fiber:end` (see [Interruption](#interruption)).
- **Interruption unwinds synchronously.** In `structuredInterruption`, `racing` and `deadlock`, an interrupted fiber resumes and ends while its interrupter is still running, so the interrupter's own suspend and resume around it are gone.
- **A retry without a delay sleeps for zero.** `retry` shows a suspend and a resume between attempts (see [Retries](#retries)).
