/**
 * The step ladder: what happens when the user clicks step.
 *
 * Two separate things can move a program forward. The `GatedScheduler` holds
 * fibers that are ready to run. The `VirtualClock` holds fibers that are waiting
 * for a deadline. A step has to consult both, in that order, because a fiber
 * that can run now should run before time is allowed to move.
 *
 * Because we supply both, we know almost everything that could happen next. The
 * one thing we cannot see is work outstanding in the outside world — a network
 * reply has not arrived yet, and nothing in our queues reflects that. So the
 * bottom rung reports "no progress" rather than claiming a deadlock.
 *
 * A step is not fully settled the moment it returns. Part of a fiber's
 * completion lands outside our scheduler and needs a turn of the event loop, and
 * a microtask is not enough. Consecutive steps must therefore be separated by
 * one; in the UI every click already is. A loop that steps without yielding will
 * report `noProgress` for a program that has in fact finished.
 */
import type { GatedScheduler } from "@/runtime/gatedScheduler";
import type { VirtualClock } from "@/runtime/virtualClock";

export type StepOutcome =
  /** Ran queued work. */
  | { readonly _tag: "released"; readonly tasks: number }
  /** Nothing was runnable, so virtual time moved to the next deadline. */
  | {
      readonly _tag: "advancedClock";
      readonly toVirtual: number;
      readonly tasks: number;
    }
  /** The program is over. */
  | { readonly _tag: "finished" }
  /**
   * Nothing is runnable, no deadline is pending, and the program has not
   * finished. Either fibers are waiting on each other, or something outside is
   * still to answer. We cannot tell which without reading fiber status, which
   * needs the very scheduler we are gating.
   */
  | { readonly _tag: "noProgress" };

export interface StepperOptions {
  readonly scheduler: GatedScheduler;
  readonly clock: VirtualClock;
  /** Whether the root program has completed. */
  readonly isFinished: () => boolean;
  /** Bound on tasks released per step, so one click cannot run everything. */
  readonly maxTasksPerStep?: number;
}

const DEFAULT_MAX_TASKS_PER_STEP = 1000;

export class Stepper {
  readonly #scheduler: GatedScheduler;
  readonly #clock: VirtualClock;
  readonly #isFinished: () => boolean;
  readonly #maxTasks: number;
  /**
   * Trace events seen so far. A step runs until this moves, because a single
   * task is often runtime bookkeeping and a button that sometimes does nothing
   * visible reads as broken.
   */
  #eventCount = 0;

  constructor(options: StepperOptions) {
    this.#scheduler = options.scheduler;
    this.#clock = options.clock;
    this.#isFinished = options.isFinished;
    this.#maxTasks = options.maxTasksPerStep ?? DEFAULT_MAX_TASKS_PER_STEP;
  }

  /** Call from the trace emit path. */
  noteEvent(): void {
    this.#eventCount++;
  }

  get eventCount(): number {
    return this.#eventCount;
  }

  pause(): void {
    this.#scheduler.pause();
  }

  /**
   * Resume normal execution. Also required before interrupting: interruption is
   * delivered as a task, so a gated program cannot be torn down.
   */
  play(): void {
    this.#scheduler.play();
  }

  /** True when a step would do something. Drives the step button. */
  canStep(): boolean {
    if (this.#isFinished()) return false;
    return this.#scheduler.queuedCount > 0 || this.#clock.pendingCount > 0;
  }

  step(): StepOutcome {
    if (this.#isFinished()) return { _tag: "finished" };

    const before = this.#eventCount;
    let tasks = 0;

    if (this.#scheduler.queuedCount > 0) {
      tasks = this.#releaseUntilVisible();
      if (this.#eventCount > before) return { _tag: "released", tasks };
      // Only bookkeeping ran, so a deadline may still be waiting.
    }

    // Nothing can run, but a fiber is due to wake. Move virtual time to that
    // deadline; the timer then queues the work that the release below runs.
    if (this.#clock.pendingCount > 0) {
      this.#clock.advanceToNextDeadline();
      return {
        _tag: "advancedClock",
        toVirtual: this.#clock.now(),
        tasks: tasks + this.#releaseUntilVisible(),
      };
    }

    // Work ran but produced nothing visible; that is still progress.
    return tasks > 0 ? { _tag: "released", tasks } : { _tag: "noProgress" };
  }

  /** Drop everything held. The caller resumes and interrupts separately. */
  reset(): void {
    this.#scheduler.clear();
    this.#clock.clearAll();
    this.#eventCount = 0;
  }

  #releaseUntilVisible(): number {
    const before = this.#eventCount;
    return this.#scheduler.releaseUntil(
      () => this.#eventCount > before,
      this.#maxTasks,
    );
  }
}
