import { Tracer, Exit, Cause, Option, Context } from "effect";
import type { RuntimeFiber } from "effect/Fiber";

import { randomUUID } from "@/lib/crypto";
import type { TraceEvent } from "@/types/trace";

export function makeVizTracer(onEmit: (event: TraceEvent) => void) {
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
        timestamp: Date.now(),
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
          _endTime: bigint,
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
            timestamp: Date.now(),
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
