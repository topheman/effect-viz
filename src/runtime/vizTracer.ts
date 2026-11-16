import { Cause, Exit, Fiber, Tracer } from "effect";

import { randomUUID } from "@/lib/crypto";
import { fiberLabel, makeFiberLifecycle } from "@/runtime/fiberLifecycle";
import type { Now } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

const NANOS_PER_MILLI = 1_000_000n;

/**
 * The runtime hands span times in as nanoseconds taken from the Clock service,
 * so they are already virtual and we use them rather than reading a clock again.
 *
 * `0n` is not a timestamp, it is Effect's "no timing recorded" sentinel: when
 * `References.TracerTimingEnabled` is off — it defaults to on — the runtime
 * skips the clock read entirely and passes a constant zero instead. Treating
 * that as a value would date every span to 1 January 1970 and flatten the
 * timeline, so we fall back to `now` in that case.
 *
 * Dividing as BigInt before converting keeps the value exact: a nanosecond epoch
 * is around 1.8e18, well past `Number.MAX_SAFE_INTEGER`.
 */
function toMillis(nanos: bigint, now: Now): number {
  return nanos === 0n ? now() : Number(nanos / NANOS_PER_MILLI);
}

/**
 * The visualizer's tracer: `span` emits `effect:start`/`effect:end` for every
 * `withSpan`, and `context` emits the fiber lifecycle (see `fiberLifecycle.ts`).
 */
export function makeVizTracer(
  onEmit: (event: TraceEvent) => void,
  now: Now,
): Tracer.Tracer {
  const lifecycle = makeFiberLifecycle(onEmit, now);

  const span: Tracer.Tracer["span"] = (options) => {
    const id = randomUUID();
    // The runtime calls `span` synchronously from the fiber entering the span,
    // so the current fiber is the one doing the work. The end event reuses it,
    // keeping a span's start and end on the same lane.
    const current = Fiber.getCurrent();
    const fiberId = current ? fiberLabel(current) : "#-1";
    onEmit({
      type: "effect:start",
      label: options.name,
      id,
      fiberId,
      timestamp: toMillis(options.startTime, now),
    });
    const attributes = new Map<string, unknown>();
    return {
      _tag: "Span",
      name: options.name,
      spanId: id,
      traceId: id,
      parent: options.parent,
      annotations: options.annotations,
      status: { _tag: "Started", startTime: options.startTime },
      attributes,
      links: options.links,
      sampled: options.sampled,
      kind: options.kind,
      end(endTime, exit) {
        const { result, value, error } = Exit.isSuccess(exit)
          ? ({ result: "success", value: exit.value } as const)
          : ({ result: "failure", error: Cause.squash(exit.cause) } as const);
        onEmit({
          type: "effect:end",
          id,
          fiberId,
          result,
          value,
          error,
          timestamp: toMillis(endTime, now),
        });
      },
      attribute(key, value) {
        attributes.set(key, value);
      },
      event() {},
      addLinks() {},
    };
  };

  return Tracer.make({ span, context: lifecycle.context });
}
