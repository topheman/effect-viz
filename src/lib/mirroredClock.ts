/**
 * The page's model of a virtual clock running in the WebContainer.
 *
 * The container's `VirtualClock` is the only clock: it is what `Effect.sleep`
 * counts down in and what stamps every trace event. This is a *predictor* over
 * it, used for the one thing event timestamps cannot supply — the timeline's
 * cursor in the gaps between events.
 *
 * Between readings it extrapolates at the run's rate, exactly as the container
 * does. On every authoritative reading — a trace event's timestamp, or the
 * `virtualNow` on a control reply — it snaps. Both clocks derive from the same
 * monotonic hardware source, so the two never tick at different speeds; the
 * error is an offset of about one message latency, and snapping bounds it
 * instead of letting it accumulate.
 *
 * A step is why the snapping is not optional: stepping over a five second sleep
 * moves the container's clock five seconds in one go, which no amount of
 * extrapolating from a rate will predict.
 */
import { computeVirtualNow, type VirtualAnchor } from "@/lib/timelineTime";

export class MirroredClock {
  /** The run's rate; 0 while paused. */
  #rate: number;
  /** The rate the run is going at when not paused; changes with the speed control. */
  #runRate: number;
  #anchor: VirtualAnchor | null = null;

  constructor(rate: number) {
    this.#rate = rate;
    this.#runRate = rate;
  }

  get rate(): number {
    return this.#rate;
  }

  now(): number {
    return computeVirtualNow(this.#anchor, this.#rate, performance.now());
  }

  /**
   * Take an authoritative reading from the container.
   *
   * Corrections only ever move the cursor forward. A reading is always a little
   * stale by the time it arrives, so one that lands behind the prediction means
   * the page ran ahead by a message latency rather than that time went
   * backwards — and a playhead that rewinds reads as a bug in a way that one
   * briefly running ahead does not.
   */
  sync(virtualNow: number): void {
    const current = this.#anchor === null ? -Infinity : this.now();
    this.#anchor = {
      virtual: Math.max(virtualNow, current),
      wall: performance.now(),
    };
  }

  /**
   * Freeze, because the container has frozen. While paused no trace events
   * arrive, so there are no corrections: a frozen cursor holds a static error
   * where a running one would drift for as long as the user reads the screen.
   */
  pause(): void {
    this.#setRate(0);
  }

  resume(): void {
    this.#setRate(this.#runRate);
  }

  /**
   * Follow a live speed change. Applied on the container's reply rather than on
   * the click, for the same reason `resume` is: the container keeps running at
   * the old rate for a round trip, and a model that changed slope early would
   * predict ahead of it for good.
   *
   * While paused only `#runRate` moves — the cursor stays frozen and picks the
   * new rate up on resume.
   */
  setRunRate(rate: number): void {
    this.#runRate = rate;
    if (this.#rate !== 0) this.#setRate(rate);
  }

  /** Re-anchor before the slope changes, or the elapsed interval is re-read at a rate that was never in effect for it. */
  #setRate(rate: number): void {
    if (rate === this.#rate) return;
    if (this.#anchor !== null) {
      this.#anchor = { virtual: this.now(), wall: performance.now() };
    }
    this.#rate = rate;
  }
}
