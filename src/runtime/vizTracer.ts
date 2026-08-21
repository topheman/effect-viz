import { Tracer, Exit, Cause, Option, Context } from "effect";
import type { RuntimeFiber } from "effect/Fiber";

import { randomUUID } from "@/lib/crypto";
import type { Now } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

const NANOS_PER_MILLI = 1_000_000n;

/**
 * The runtime hands span times in as nanoseconds taken from the Clock service
 * (`internal/core-effect.ts` builds them with `clock.unsafeCurrentTimeNanos()`),
 * so they are already virtual and we use them rather than reading a clock again.
 *
 * `0n` is not a timestamp, it is Effect's "no timing recorded" sentinel: when the
 * `currentTracerTimingEnabled` FiberRef is off — it defaults to on, and
 * `Effect.withTracerTiming(false)` turns it off — the runtime skips the clock
 * read entirely and passes a constant zero instead. Treating that as a value
 * would date every span to 1 January 1970 and flatten the timeline, so we fall
 * back to `now` in that case.
 *
 * Dividing as BigInt before converting keeps the value exact: a nanosecond epoch
 * is around 1.8e18, well past `Number.MAX_SAFE_INTEGER`.
 */
function toMillis(nanos: bigint, now: Now): number {
  return nanos === 0n ? now() : Number(nanos / NANOS_PER_MILLI);
}

export function makeVizTracer(onEmit: (event: TraceEvent) => void, now: Now) {
  return Tracer.make({
    span: function (
      label: string,
      parent: Option.Option<Tracer.AnySpan>,
      context: Context.Context<never>,
      links: ReadonlyArray<Tracer.SpanLink>,
      startTime: bigint,
      kind: Tracer.SpanKind,
      options?: Tracer.SpanOptions,
    ): Tracer.Span {
      const id = randomUUID();
      onEmit({
        type: "effect:start",
        label,
        id,
        timestamp: toMillis(startTime, now),
      });
      return {
        _tag: "Span",
        name: label,
        spanId: id,
        traceId: id,
        parent,
        context,
        status: {
          _tag: "Started",
          startTime,
        },
        attributes: new Map(Object.entries(options?.attributes ?? {})),
        links,
        sampled: false,
        kind,
        end: function (
          endTime: bigint,
          exit: Exit.Exit<unknown, unknown>,
        ): void {
          const { result, value, error } = Exit.isSuccess(exit)
            ? ({ result: "success", value: exit.value } as const)
            : ({ result: "failure", error: Cause.squash(exit.cause) } as const);
          onEmit({
            type: "effect:end",
            id,
            result,
            value,
            error,
            timestamp: toMillis(endTime, now),
          });
        },
        attribute: function (): void {},
        event: function (): void {},
        addLinks: function (): void {},
      };
    },
    context: function <X>(
      f: () => X,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _fiber: RuntimeFiber<unknown, unknown>,
    ): X {
      return f();
    },
  });
}
