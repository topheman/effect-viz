# Migrating to Effect 4

Phases 1 to 11 were built on Effect 3, and the visualizer draws what that runtime does: which fibers it forks, when it suspends them, how it interrupts them and in what order it runs their finalizers. Effect 4 is a new major version of that runtime, so this document records, primitive by primitive, what changed underneath the visualizer and what the migration changed in `src/runtime/` and in the traces as a result.

Each section is filled in by the pull request that migrates that part of the runtime, from what that pull request measured. A section that still says _To be written_ describes a part not migrated yet.

## One version, on both paths

The in-browser path bundles the `effect` this repo depends on, and the WebContainer installs its own copy from the `package.json` that `src/services/webcontainer.ts` mounts, pinned to the same version through `__EFFECT_VERSION__`. This section covers what a major version changes in that arrangement.

_To be written._

## Running a program

`runProgram.ts` starts the program with `Effect.runFork`, reports the root fiber's fork from `updateRefs` and names fibers with `FiberId.threadName`. The scheduler, the clock and the supervisor are installed with `Effect.withScheduler`, `Layer.setClock` and `Supervisor.addSupervisor`. This section covers how Effect 4 starts a program and identifies its fibers.

_To be written._

## Fibers and the Supervisor

`vizSupervisor.ts` reports each fiber's fork, suspend, resume and end from Effect's `Supervisor`, skipping the fibers that build layers. This section covers whether Effect 4 still exposes a `Supervisor`, or what the visualizer hooks into instead, and whether the fork tree it draws is still the one the program creates.

_To be written._

## Scheduling

`gatedScheduler.ts` takes over the runtime's scheduler so a run can be paused, and `stepper.ts` releases queued tasks until the trace moves, or advances virtual time when nothing is runnable. This section covers the scheduler interface Effect 4 expects and whether a step still advances the program by the same unit.

_To be written._

## Time and sleep

`virtualClock.ts` and `vizClock.ts` replace the runtime's clock so slow mode can stretch a `sleep` without changing what the program computes. This section covers the clock Effect 4 exposes and how a suspended fiber is reported while it sleeps.

_To be written._

## Interruption

`vizSupervisor.ts` labels a fiber's end from its exit: `fiber:end` for a success, `fiber:interrupt` for anything else. This section covers how Effect 4 reports an interrupted fiber's exit, and whether each example still ends on the same event.

_To be written._

## Scopes and finalizers

`acquireReleaseWithTrace` and `addFinalizerWithTrace` in `tracedRunner.ts` trace resources as they are acquired and released. This section covers Effect 4's `Scope` and whether finalizers still run, and are traced, in the same order.

_To be written._

## Retries

`retryWithTrace` in `tracedRunner.ts` drives its loop with `Schedule.driver` so each attempt can be traced. This section covers the `Schedule` API in Effect 4 and whether the loop still maps onto it.

_To be written._

## Tracing

`vizTracer.ts` turns `Effect.withSpan` into `effect:start` and `effect:end` events. This section covers the `Tracer` interface in Effect 4 and whether the spans the Execution Log shows are the same.

_To be written._

## The examples, before and after

The 3.22 upgrade compared every example's trace under both versions, with span ids and timestamps stripped. This section says which examples, if any, trace differently under Effect 4, and why.

_To be written._
