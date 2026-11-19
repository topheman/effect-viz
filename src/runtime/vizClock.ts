/**
 * An Effect `Clock` backed by the `VirtualClock`.
 *
 * Everything time-related in Effect goes through this service — `Effect.sleep`,
 * `Schedule` delays, `Effect.timeout`, `Effect.race`, and even the timestamps
 * on `Effect.log`. Replacing it scales *all* of them by the same factor, so a
 * program's observable behaviour is unchanged: it is slow motion, not a
 * distortion. Only the wall-clock duration changes.
 */
import { Duration, Effect } from "effect";
import type { Clock } from "effect";

import type { SleepLog } from "@/runtime/fiberLifecycle";
import type { VirtualClock } from "@/runtime/virtualClock";

const NANOS_PER_MILLI = 1_000_000;

/**
 * `wake` runs the resume of a fiber whose sleep is over. The visualizer passes
 * `GatedScheduler.wake`, so a timer firing while paused only queues it.
 * `sleeps` hears of every sleep, so the trace can say a fiber suspends on a timer.
 */
export function makeVizClock(
  virtual: VirtualClock,
  wake: (resume: () => void) => void = (resume) => resume(),
  sleeps?: SleepLog,
): Clock.Clock {
  const currentTimeMillisUnsafe = () => virtual.now();
  const currentTimeNanosUnsafe = () =>
    BigInt(Math.round(virtual.now() * NANOS_PER_MILLI));

  return {
    currentTimeMillisUnsafe,
    currentTimeNanosUnsafe,
    // Virtual time is monotonic: it only changes slope, never jumps back.
    monotonicTimeNanosUnsafe: currentTimeNanosUnsafe,
    // `Effect.sync` defers, so these read virtual time when run, not when built.
    currentTimeMillis: Effect.sync(currentTimeMillisUnsafe),
    currentTimeNanos: Effect.sync(currentTimeNanosUnsafe),
    monotonicTimeNanos: Effect.sync(currentTimeNanosUnsafe),
    sleep: (duration: Duration.Duration) =>
      Effect.callback<void>((resume) => {
        const millis = Duration.toMillis(duration);
        sleeps?.started(millis);
        const cancel = virtual.sleep(millis, () =>
          wake(() => resume(Effect.void)),
        );
        // Returned canceler runs on interruption, so an interrupted fiber does
        // not leave a timer pending on the virtual clock.
        return Effect.sync(cancel);
      }),
  };
}
