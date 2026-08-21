import { Tracer, Exit, Cause, Option, Context } from "effect";
import type { RuntimeFiber } from "effect/Fiber";

import { randomUUID } from "@/lib/crypto";
import type { Now } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

const NANOS_PER_MILLI = 1_000_000n;

/**
 * The runtime hands span times in as nanoseconds taken from the Clock service
 * (`internal/core-effect.ts` builds them with `clock.unsafeCurrentTimeNanos()`),
 * so they are already virtual and we should use them rather than reading a clock
 * ourselves. They are `0n` when tracer timing is disabled, which is when `now`
 * is needed as a fallback.
 *
 * Dividing as BigInt before converting keeps the value inside the safe integer
 * range; nanosecond epochs do not fit in a double.
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
