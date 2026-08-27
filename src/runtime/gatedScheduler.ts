/**
 * A `Scheduler` that can hold the Effect runtime still.
 *
 * The `VirtualClock` slows down the gaps that a program spends *sleeping*. It
 * cannot touch the bursts of work between sleeps, because there is no gap there
 * to stretch. Those bursts are where forks, races and interruptions happen, so
 * they are exactly what a user wants to watch one event at a time.
 *
 * A fiber that must continue later does not continue itself. The runtime turns
 * the continuation into a **task** and hands it to the `Scheduler`, which
 * decides when to run it. Taking over that decision is therefore how execution
 * is paused and stepped.
 *
 * While playing, every task goes straight to Effect's own scheduler, so normal
 * execution is unchanged. While paused, tasks are queued and only a step
 * releases them.
 *
 * Note that interruption is delivered as a task as well. A paused program
 * therefore cannot be interrupted, so anything that tears a run down — Reset —
 * must call `play()` first.
 */
import { Scheduler } from "effect";
import type { RuntimeFiber } from "effect/Fiber";

export type SchedulerMode = "playing" | "paused";

export interface GatedSchedulerOptions {
  /** Effect's scheduler, used verbatim while playing. */
  readonly inner?: Scheduler.Scheduler;
  /** Called whenever the number of queued tasks changes. */
  readonly onQueueChange?: (queued: number) => void;
}

export class GatedScheduler implements Scheduler.Scheduler {
  readonly #inner: Scheduler.Scheduler;
  readonly #onQueueChange: ((queued: number) => void) | undefined;
  #mode: SchedulerMode = "playing";
  /** Reuses Effect's own priority ordering so a release picks the task the runtime would have picked. */
  #queued = new Scheduler.PriorityBuckets<Scheduler.Task>();
  #queuedCount = 0;
  /** Tasks handed to the inner scheduler that have not run yet. */
  #inFlight = 0;

  constructor(options: GatedSchedulerOptions = {}) {
    this.#inner = options.inner ?? Scheduler.defaultScheduler;
    this.#onQueueChange = options.onQueueChange;
  }

  get mode(): SchedulerMode {
    return this.#mode;
  }

  /** Tasks waiting for a step. Always 0 while playing. */
  get queuedCount(): number {
    return this.#queuedCount;
  }

  /**
   * Whether any task could still run without help. Used to tell "busy" from
   * "stuck": with nothing here and no pending timer, the program cannot move.
   */
  get pendingCount(): number {
    return this.#queuedCount + this.#inFlight;
  }

  /**
   * Tasks already handed to the inner scheduler still run: they are out of our
   * hands. Anything they schedule is queued, so a pause takes hold within one
   * scheduler turn rather than instantly.
   */
  pause(): void {
    this.#mode = "paused";
  }

  /** Hand every queued task back to the runtime and resume normal execution. */
  play(): void {
    this.#mode = "playing";
    const draining = this.#drainQueue();
    for (const task of draining) {
      this.#runViaInner(task);
    }
  }

  /**
   * A fiber asks this before continuing its next operation. Effect's own answer
   * is used in both modes: gating decides *when* a task runs, never whether a
   * running fiber should hand control back. Overriding it would stop a released
   * fiber from reaching its next operation at all.
   *
   * Pausing therefore lands on the runtime's own yield points, where the program
   * is in a consistent state.
   */
  shouldYield(fiber: RuntimeFiber<unknown, unknown>): number | false {
    return this.#inner.shouldYield(fiber);
  }

  scheduleTask(task: Scheduler.Task, priority: number): void {
    if (this.#mode === "paused") {
      this.#queued.scheduleTask(task, priority);
      this.#queuedCount++;
      this.#onQueueChange?.(this.#queuedCount);
      return;
    }
    this.#runViaInner(task, priority);
  }

  /**
   * Run the highest-priority queued task, in the order the runtime would have
   * run it. Returns false when nothing was queued.
   *
   * The task runs synchronously and may queue more work; that work stays queued
   * for the next release rather than joining this one.
   */
  releaseOne(): boolean {
    const task = this.#takeNext();
    if (task === null) return false;
    task();
    return true;
  }

  /**
   * Release tasks until `isSatisfied` returns true, or until nothing is left.
   * Returns how many ran.
   *
   * A single task is often runtime bookkeeping — building a `Layer`, finishing a
   * scope — rather than anything the user can see. A step button wired straight
   * to `releaseOne` would therefore appear to do nothing at random. The caller
   * supplies the condition that counts as visible progress, usually "one more
   * trace event has been emitted".
   *
   * `maxTasks` bounds the work so a predicate that never becomes true cannot
   * run the whole program on one click.
   */
  releaseUntil(isSatisfied: () => boolean, maxTasks = 1000): number {
    let released = 0;
    while (released < maxTasks) {
      if (!this.releaseOne()) break;
      released++;
      if (isSatisfied()) break;
    }
    return released;
  }

  /** Drop every queued task. Used on reset. */
  clear(): void {
    this.#drainQueue();
  }

  #runViaInner(task: Scheduler.Task, priority = 0): void {
    this.#inFlight++;
    this.#inner.scheduleTask(() => {
      this.#inFlight--;
      task();
    }, priority);
  }

  #takeNext(): Scheduler.Task | null {
    for (const bucket of this.#queued.buckets) {
      const tasks = bucket[1];
      if (tasks.length > 0) {
        const task = tasks.shift()!;
        this.#queuedCount--;
        this.#onQueueChange?.(this.#queuedCount);
        return task;
      }
    }
    return null;
  }

  #drainQueue(): Scheduler.Task[] {
    const tasks = this.#queued.buckets.flatMap(([, bucket]) => bucket);
    this.#queued = new Scheduler.PriorityBuckets<Scheduler.Task>();
    this.#queuedCount = 0;
    if (tasks.length > 0) this.#onQueueChange?.(0);
    return tasks;
  }
}
