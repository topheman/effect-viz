# Migrating to Effect 4

Phases 1 to 11 were built on Effect 3, and the visualizer draws what that runtime does: which fibers it forks, when it suspends them, how it interrupts them and in what order it runs their finalizers. Effect 4 is a new major version of that runtime, so this document records, primitive by primitive, what changed underneath the visualizer and what the migration changed in `src/runtime/` and in the traces as a result.

Each section is filled in by the pull request that migrates that part of the runtime, from what that pull request measured. A section that still says _To be written_ describes a part not migrated yet.

## Fibers and the Supervisor

`vizSupervisor.ts` reports each fiber's fork and end from Effect's `Supervisor`, and filters out the fibers the runtime creates for itself. This section covers what Effect 4 offers in its place and whether the fork tree the visualizer draws is still the one the program creates.

_To be written._

## Scheduling

`GatedScheduler` takes over the runtime's scheduler so a run can be paused and stepped one task at a time, and `stepper.ts` drives it. This section covers the scheduler interface Effect 4 expects and whether a step still advances the program by the same unit.

_To be written._

## Time and sleep

`VirtualClock` and `vizClock.ts` replace the runtime's clock so slow mode can stretch a `sleep` without changing what the program computes. This section covers the clock Effect 4 exposes and how a suspended fiber is reported while it sleeps.

_To be written._

## Interruption

A fiber interrupted by `Effect.race`, `Effect.timeout` or its parent's end shows as `fiber:interrupt` in the trace. This section covers how Effect 4 reports an interrupted fiber's exit, and which examples change their final event as a result.

_To be written._

## Scopes and finalizers

`acquireReleaseWithTrace` and `addFinalizerWithTrace` in `tracedRunner.ts` trace resources as they are acquired and released. This section covers Effect 4's `Scope` and whether finalizers still run, and are traced, in the same order.

_To be written._

## Tracing

`vizTracer.ts` turns `Effect.withSpan` into `effect:start` and `effect:end` events. This section covers the `Tracer` interface in Effect 4 and what changes in the spans the Execution Log shows.

_To be written._

## The examples, before and after

The 3.22 upgrade compared every example's trace under both versions, and this migration does the same. This section lists the examples whose trace differs under Effect 4, and why.

_To be written._
