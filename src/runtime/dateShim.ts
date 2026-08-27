/**
 * Makes raw `Date` read virtual time instead of wall time.
 *
 * Effect's own notion of time already comes from the `Clock` service, so once
 * `vizClock` is provided, `Effect.sleep`, `Schedule`, `timeout` and even
 * `Effect.log` timestamps are all scaled. Code calling `Date.now()` directly
 * bypasses that and would keep reading wall time, disagreeing with everything
 * around it. This shim closes that gap.
 *
 * Installed **only in the WebContainer**, where the process runs nothing but the
 * user's program. The in-browser fallback path shares a realm with React, so
 * patching `Date` there would distort the UI's own timing and animations.
 *
 * Deliberately untouched:
 * - `performance.now()` stays on wall time, so there is always a way to measure
 *   how much real time something actually took.
 * - `setTimeout` is not intercepted. Raw timers are already invisible to Effect's
 *   runtime, so code using them has stepped outside the model being visualised.
 */
import type { VirtualClock } from "@/runtime/virtualClock";

/**
 * Replace the global `Date` with one reading `virtual`. Returns a function that
 * restores the original.
 *
 * Safe to call at any point: `VirtualClock` reads wall time from `performance`,
 * which is never shimmed, so the two cannot read each other however the modules
 * are ordered.
 *
 * It must still be installed *before* the code it is meant to affect is
 * evaluated — a module that runs first sees the real `Date`.
 */
export function installDateShim(virtual: VirtualClock): () => void {
  const RealDate = globalThis.Date;

  /** `Date.now()` returns whole milliseconds; virtual time is fractional. */
  const virtualNow = () => Math.floor(virtual.now());

  // A Proxy rather than a subclass: `Date()` without `new` is legal JavaScript
  // and returns a string, which a class constructor cannot do. The Proxy also
  // keeps `instanceof`, `Date.parse`, `Date.UTC` and the prototype intact for
  // free, since the target is the real `Date`.
  const ShimmedDate = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      // Only the zero-argument form means "now". `new Date(ms)` and
      // `new Date(y, m, d)` must keep their explicit meaning — Effect itself
      // builds log timestamps with `new Date(clock.unsafeCurrentTimeMillis())`.
      const resolved = args.length === 0 ? [virtualNow()] : args;
      return Reflect.construct(target, resolved, newTarget);
    },
    apply() {
      // `Date(...)` ignores its arguments and returns the current time as a string.
      return new RealDate(virtualNow()).toString();
    },
    get(target, property, receiver) {
      if (property === "now") return virtualNow;
      return Reflect.get(target, property, receiver);
    },
  });

  globalThis.Date = ShimmedDate;

  return () => {
    globalThis.Date = RealDate;
  };
}
