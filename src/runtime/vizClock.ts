/**
 * An Effect `Clock` backed by the `VirtualClock`.
 *
 * Everything time-related in Effect goes through this service — `Effect.sleep`,
 * `Schedule` delays, `Effect.timeout`, `Effect.race`, and even the timestamps
 * on `Effect.log`. Replacing it scales *all* of them by the same factor, so a
 * program's observable behaviour is unchanged: it is slow motion, not a
 * distortion. Only the wall-clock duration changes.
 */
import { Clock, Duration, Effect, Layer } from "effect";

import type { VirtualClock } from "@/runtime/virtualClock";

const NANOS_PER_MILLI = 1_000_000;

export function makeVizClock(virtual: VirtualClock): Clock.Clock {
  const unsafeCurrentTimeMillis = () => virtual.now();
  const unsafeCurrentTimeNanos = () =>
    BigInt(Math.round(virtual.now() * NANOS_PER_MILLI));

  return {
    [Clock.ClockTypeId]: Clock.ClockTypeId,
    unsafeCurrentTimeMillis,
    unsafeCurrentTimeNanos,
    // `Effect.sync` defers, so these read virtual time when run, not when built.
    currentTimeMillis: Effect.sync(unsafeCurrentTimeMillis),
    currentTimeNanos: Effect.sync(unsafeCurrentTimeNanos),
    sleep: (duration: Duration.Duration) =>
      Effect.async<void>((resume) => {
        const cancel = virtual.sleep(Duration.toMillis(duration), () =>
          resume(Effect.void),
        );
        // Returned canceler runs on interruption, so an interrupted fiber does
        // not leave a timer pending on the virtual clock.
        return Effect.sync(cancel);
      }),
  };
}

export const makeVizClockLayer = (virtual: VirtualClock): Layer.Layer<never> =>
  Layer.setClock(makeVizClock(virtual));
