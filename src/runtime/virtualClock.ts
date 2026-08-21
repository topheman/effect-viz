/**
 * Virtual time source shared by the Effect `Clock` layer and the `Date` shim.
 *
 * Two notions of time are kept distinct throughout this file:
 *
 * - **wall time** — real elapsed time, read from `performance`. Always moves
 *   forward at its own pace; we cannot influence it.
 * - **virtual time** — the time the running program believes it is in. It is
 *   what the Effect `Clock` reports and what `Effect.sleep` counts down in.
 *
 * Virtual time is a piecewise-linear function of wall time: it advances at
 * `rate` virtual milliseconds per wall millisecond. `rate = 1` is real time,
 * `rate = 0.5` is half speed, `rate = 0` freezes virtual time while wall time
 * keeps going (pause). See `workshop/phase-10.md` for the full rationale.
 *
 * Every rate change re-anchors the mapping, so virtual time is continuous: it
 * never jumps when the user changes speed, it only changes slope.
 *
 * Pause is expressed by *parking* pending timers, not by dividing the delay by
 * the rate. `setTimeout(fn, d / 0)` is `setTimeout(fn, Infinity)`, which
 * overflows a 32-bit signed integer and fires after ~1ms — pause would wake
 * every sleeping fiber instead of freezing it.
 */

/**
 * Wall time as an epoch timestamp, read from `performance` rather than `Date`.
 *
 * The `Date` shim reads this clock, so the clock must never read the shim back.
 * Capturing `Date.now` at module load would achieve that only as long as this
 * module is always evaluated before the shim is installed — a guarantee that
 * would live in import order and be enforced by nothing, failing as unbounded
 * recursion if it were ever broken. `performance` is never shimmed, so reading
 * it makes the clock immune by construction instead.
 *
 * `performance.now()` is also monotonic, so virtual time cannot jump backwards
 * when the system clock is corrected by NTP or changed by the user.
 */
const wallNow = () => performance.timeOrigin + performance.now();

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);

/**
 * Reads the current timestamp in epoch milliseconds on the virtual clock.
 *
 * Passed to the trace emitters that run outside an Effect context — `Supervisor`
 * callbacks and `runProgramFork` — so their timestamps are virtual like every
 * other event's. Code that *is* inside an Effect uses `Clock.currentTimeMillis`
 * instead.
 */
export type Now = () => number;

/** The wall-clock primitives the virtual clock is built on. Injectable for tests. */
export interface VirtualClockHost {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultHost: VirtualClockHost = {
  now: wallNow,
  setTimeout: realSetTimeout,
  clearTimeout: (handle) =>
    realClearTimeout(handle as ReturnType<typeof realSetTimeout>),
};

interface Timer {
  readonly id: number;
  /** Virtual timestamp at which this timer is due. */
  readonly deadline: number;
  readonly run: () => void;
  /** Real timer handle, or null while parked (rate 0). */
  handle: unknown;
}

export interface VirtualClockOptions {
  /** Virtual ms per wall ms. Defaults to 1 (real time). */
  rate?: number;
  /** Epoch-based starting point, so `new Date(clock.now())` reads sensibly. */
  origin?: number;
  host?: VirtualClockHost;
}

export class VirtualClock {
  readonly #host: VirtualClockHost;
  #rate: number;
  /** Virtual timestamp at the last re-anchor. */
  #virtualAnchor: number;
  /** Wall timestamp at the last re-anchor. */
  #wallAnchor: number;
  #timers = new Map<number, Timer>();
  #nextId = 1;

  constructor(options: VirtualClockOptions = {}) {
    this.#host = options.host ?? defaultHost;
    this.#rate = options.rate ?? 1;
    this.#virtualAnchor = options.origin ?? this.#host.now();
    this.#wallAnchor = this.#host.now();
  }

  get rate(): number {
    return this.#rate;
  }

  /** Whether time is frozen. Pending timers stay parked until the rate is raised. */
  get isPaused(): boolean {
    return this.#rate === 0;
  }

  /** Current virtual timestamp, epoch-based. */
  now(): number {
    return (
      this.#virtualAnchor + (this.#host.now() - this.#wallAnchor) * this.#rate
    );
  }

  /**
   * Change the speed of time. Re-anchors so virtual time stays continuous, then
   * re-arms every pending timer against the new rate.
   */
  setRate(rate: number): void {
    if (rate < 0) {
      throw new Error(`VirtualClock rate must be >= 0, received ${rate}`);
    }
    if (rate === this.#rate) return;
    this.#reanchor(this.now());
    this.#rate = rate;
    this.#rearmAll();
  }

  /**
   * Schedule `run` after `durationMs` of *virtual* time. Returns a cancel function.
   */
  sleep(durationMs: number, run: () => void): () => void {
    const id = this.#nextId++;
    const timer: Timer = {
      id,
      deadline: this.now() + Math.max(0, durationMs),
      run,
      handle: null,
    };
    this.#timers.set(id, timer);
    this.#arm(timer);
    return () => this.#cancel(id);
  }

  /** Number of timers waiting to fire. */
  get pendingCount(): number {
    return this.#timers.size;
  }

  /** Earliest pending virtual deadline, or null when nothing is scheduled. */
  earliestDeadline(): number | null {
    let earliest: number | null = null;
    for (const timer of this.#timers.values()) {
      if (earliest === null || timer.deadline < earliest) {
        earliest = timer.deadline;
      }
    }
    return earliest;
  }

  /**
   * Jump virtual time forward to the earliest pending deadline and fire
   * everything due. This is how a paused clock makes progress: it is the
   * time-blocked rung of the stepper.
   *
   * Returns false when nothing was pending.
   */
  advanceToNextDeadline(): boolean {
    const deadline = this.earliestDeadline();
    if (deadline === null) return false;
    this.#reanchor(Math.max(deadline, this.now()));
    this.#fireDue();
    // Survivors were armed against the previous anchor. At rate 0 they are
    // parked and this is a no-op; above 0 they would otherwise fire late by
    // exactly the amount of virtual time the jump skipped.
    this.#rearmAll();
    return true;
  }

  /** Cancel every pending timer. Used on reset. */
  clearAll(): void {
    for (const timer of this.#timers.values()) {
      if (timer.handle !== null) this.#host.clearTimeout(timer.handle);
    }
    this.#timers.clear();
  }

  #reanchor(virtualNow: number): void {
    this.#virtualAnchor = virtualNow;
    this.#wallAnchor = this.#host.now();
  }

  #arm(timer: Timer): void {
    // Defensive: never leave two real timeouts outstanding for one timer. A
    // stray one could not run the callback twice (see #fire) but would sit in
    // the event loop until it fired and found nothing.
    if (timer.handle !== null) this.#host.clearTimeout(timer.handle);
    if (this.#rate === 0) {
      timer.handle = null;
      return;
    }
    const remainingVirtual = Math.max(0, timer.deadline - this.now());
    timer.handle = this.#host.setTimeout(
      () => this.#fire(timer.id),
      remainingVirtual / this.#rate,
    );
  }

  #rearmAll(): void {
    for (const timer of this.#timers.values()) {
      if (timer.handle !== null) this.#host.clearTimeout(timer.handle);
      this.#arm(timer);
    }
  }

  /**
   * The only place a callback is ever invoked. Membership in `#timers` is the
   * claim to run: the entry is removed *before* `run()`, so any later path
   * reaching the same id — a stray real timeout, a cancel, a second jump —
   * finds nothing and no-ops. Ids are monotonic, so a stale callback can never
   * alias a newer timer.
   */
  #fire(id: number): void {
    const timer = this.#timers.get(id);
    if (timer === undefined) return;
    this.#timers.delete(id);
    timer.run();
  }

  /** Fire every timer already due, in deadline order. */
  #fireDue(): void {
    // Snapshot against a single reading of now(), so a timer firing (and
    // scheduling more work) cannot change which timers this pass considers.
    const now = this.now();
    const due = [...this.#timers.values()]
      .filter((timer) => timer.deadline <= now)
      .sort((a, b) => a.deadline - b.deadline);
    for (const timer of due) {
      if (timer.handle !== null) this.#host.clearTimeout(timer.handle);
      this.#fire(timer.id);
    }
  }

  #cancel(id: number): void {
    const timer = this.#timers.get(id);
    if (timer === undefined) return;
    if (timer.handle !== null) this.#host.clearTimeout(timer.handle);
    this.#timers.delete(id);
  }
}
