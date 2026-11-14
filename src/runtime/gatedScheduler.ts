/**
 * A `Scheduler` that can hold the Effect runtime still.
 *
 * The `VirtualClock` slows down the gaps that a program spends *sleeping*. It
 * cannot touch the bursts of work between sleeps, because there is no gap there
 * to stretch. Those bursts are where forks, races and interruptions happen, so
 * they are exactly what a user wants to watch one event at a time.
 *
 * Effect gives each fiber a **dispatcher**, made by the scheduler, and a fiber
 * that has to continue later hands its continuation to it as a **task**. The
 * scheduler also answers `shouldYield`, which every fiber asks before each
 * operation. Owning both is how execution is paused and stepped:
 *
 * - While playing, tasks go straight to Effect's own `MixedScheduler` and so
 *   does `shouldYield`, so normal execution is unchanged.
 * - While paused, tasks are queued and only a step releases them, and
 *   `shouldYield` answers yes. Much of Effect's work never reaches a dispatcher
 *   at all: a joiner resumes inside its child's exit, a fiber woken by a timer
 *   or an interruption runs from whatever woke it. Answering yes makes each of
 *   them run one operation and hand itself back to the queue, so a paused
 *   program is held whatever woke it, and a step is one operation. That
 *   continuation goes ahead of every other task: at full speed the fiber would
 *   have kept running, so stepping keeps the order playing would have.
 * - The virtual clock's wake-ups go through `wake`, so a timer firing while
 *   paused only queues the fiber it wakes, even one that never asks to yield
 *   (`Scheduler.PreventSchedulerYield`).
 *
 * Interruption reaches a held fiber as a task too, so a paused program cannot
 * be torn down: anything that does — Reset — must call `play()` first.
 */
import { Scheduler } from "effect";
import type { Fiber } from "effect";

export type SchedulerMode = "playing" | "paused";

type Task = () => void;

interface QueuedTask {
  readonly task: Task;
  readonly priority: number;
  /** Arrival order, so equal priorities run first in, first out. */
  readonly seq: number;
}

export interface GatedSchedulerOptions {
  /** Effect's scheduler, used verbatim while playing. */
  readonly inner?: Scheduler.Scheduler;
  /** Called whenever the number of queued tasks changes. */
  readonly onQueueChange?: (queued: number) => void;
}

export class GatedScheduler implements Scheduler.Scheduler {
  readonly executionMode = "async" as const;
  readonly #inner: Scheduler.Scheduler;
  readonly #onQueueChange: ((queued: number) => void) | undefined;
  #mode: SchedulerMode = "playing";
  /** Sorted by priority, then arrival, the order Effect's own scheduler runs them in. */
  #queued: QueuedTask[] = [];
  #seq = 0;
  /** Tasks handed to the inner scheduler that have not run yet. */
  #inFlight = 0;
  /** Set by a forced yield, so the task it schedules next goes first. */
  #forcedYield = false;
  /** How many forced continuations lead the queue. */
  #forcedAhead = 0;
  /** Forced continuations queued by the task being released, set to null outside a release. */
  #forcedThisRelease: number | null = null;
  /** Where `play()` hands back tasks queued by dispatchers it no longer knows. */
  #playDispatcher: Scheduler.SchedulerDispatcher | null = null;

  constructor(options: GatedSchedulerOptions = {}) {
    this.#inner = options.inner ?? new Scheduler.MixedScheduler();
    this.#onQueueChange = options.onQueueChange;
  }

  get mode(): SchedulerMode {
    return this.#mode;
  }

  /** Tasks waiting for a step. Always 0 while playing. */
  get queuedCount(): number {
    return this.#queued.length;
  }

  /**
   * Whether any task could still run without help. Used to tell "busy" from
   * "stuck": with nothing here and no pending timer, the program cannot move.
   */
  get pendingCount(): number {
    return this.#queued.length + this.#inFlight;
  }

  /**
   * Tasks already handed to the inner scheduler still run: they are out of our
   * hands. Their fibers then yield on their next operation, so a pause takes
   * hold within one scheduler turn rather than instantly.
   */
  pause(): void {
    this.#mode = "paused";
  }

  /** Hand every queued task back to the runtime and resume normal execution. */
  play(): void {
    this.#mode = "playing";
    for (const { task, priority } of this.#drainQueue()) {
      this.#runViaInner(task, priority);
    }
  }

  shouldYield(fiber: Fiber.Fiber<unknown, unknown>): boolean {
    if (this.#mode === "paused") {
      // The run loop answers a yes by scheduling the fiber's continuation at once.
      this.#forcedYield = true;
      return true;
    }
    return this.#inner.shouldYield(fiber);
  }

  makeDispatcher(): Scheduler.SchedulerDispatcher {
    const inner = this.#inner.makeDispatcher();
    return {
      scheduleTask: (task, priority) => {
        if (this.#mode === "paused") {
          if (this.#forcedYield) {
            this.#forcedYield = false;
            this.#enqueueForced(task, priority);
          } else {
            this.#enqueue(task, priority);
          }
          return;
        }
        this.#runViaInner(task, priority, inner);
      },
      flush: () => inner.flush(),
    };
  }

  /**
   * Run work arriving from outside the runtime, such as a timer of the virtual
   * clock: queued like any task while paused, run right away while playing.
   */
  wake(task: Task): void {
    if (this.#mode === "paused") this.#enqueue(task, 0);
    else task();
  }

  /**
   * Run the next queued task, in the order the runtime would have run it.
   * Returns false when nothing was queued.
   *
   * The task runs synchronously and may queue more work; that work stays queued
   * for the next release rather than joining this one.
   */
  releaseOne(): boolean {
    const next = this.#queued.shift();
    if (next === undefined) return false;
    if (this.#forcedAhead > 0) this.#forcedAhead--;
    this.#onQueueChange?.(this.#queued.length);
    this.#forcedThisRelease = 0;
    try {
      next.task();
    } finally {
      this.#forcedThisRelease = null;
    }
    return true;
  }

  /**
   * Release tasks until `isSatisfied` returns true, or until nothing is left.
   * Returns how many ran.
   *
   * While paused a task is one operation of one fiber, and most operations draw
   * nothing. A step button wired straight to `releaseOne` would therefore appear
   * to do nothing at random. The caller supplies the condition that counts as
   * visible progress, usually "one more trace event has been emitted".
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

  #enqueue(task: Task, priority: number): void {
    const entry = { task, priority, seq: ++this.#seq };
    // Insert after every task of the same or a more urgent priority.
    let i = this.#queued.length;
    while (i > 0 && this.#queued[i - 1].priority > priority) i--;
    this.#queued.splice(i, 0, entry);
    this.#onQueueChange?.(this.#queued.length);
  }

  /**
   * The fibers the released task held continue before anything else, in the
   * order they were held: an operator such as `race` starts several at once.
   * Fibers held while running from elsewhere — tasks already handed to the
   * inner scheduler, a timer — keep the order in which they were held too.
   */
  #enqueueForced(task: Task, priority: number): void {
    const at =
      this.#forcedThisRelease === null
        ? this.#forcedAhead
        : this.#forcedThisRelease++;
    this.#queued.splice(at, 0, { task, priority, seq: ++this.#seq });
    this.#forcedAhead++;
    this.#onQueueChange?.(this.#queued.length);
  }

  #runViaInner(
    task: Task,
    priority: number,
    dispatcher?: Scheduler.SchedulerDispatcher,
  ): void {
    this.#inFlight++;
    const target =
      dispatcher ?? (this.#playDispatcher ??= this.#inner.makeDispatcher());
    target.scheduleTask(() => {
      this.#inFlight--;
      task();
    }, priority);
  }

  #drainQueue(): QueuedTask[] {
    const tasks = this.#queued;
    this.#queued = [];
    this.#forcedAhead = 0;
    if (tasks.length > 0) this.#onQueueChange?.(0);
    return tasks;
  }
}
