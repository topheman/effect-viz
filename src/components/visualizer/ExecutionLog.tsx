import { useEffect, useRef } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTraceStore } from "@/stores/traceStore";
import type {
  EffectStartEvent,
  FiberForkEvent,
  TraceEvent,
} from "@/types/trace";

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Format a trace event into a human-readable string */
function formatEvent(event: TraceEvent, events: TraceEvent[]): string {
  switch (event.type) {
    case "effect:start":
      return `Effect started: ${event.label}`;
    case "effect:end": {
      const startEffect = events.find(
        (e) => e.type === "effect:start" && e.id === event.id,
      ) as EffectStartEvent | undefined;
      if (!startEffect) {
        return `Effect ended: ${event.id}`;
      }
      return `Effect ended: ${startEffect.label}`;
    }
    case "fiber:fork":
      return `Fiber forked: ${event.fiberId}${event.parentId ? ` (parent: ${event.parentId})` : ""} ${event.label ? `${event.label}` : ""}`;
    case "fiber:end": {
      const forkFiber = events.find(
        (e) => e.type === "fiber:fork" && e.fiberId === event.fiberId,
      ) as FiberForkEvent | undefined;
      if (!forkFiber) {
        return `Fiber ended: ${event.fiberId} : ""}`;
      }
      return `Fiber ended: ${event.fiberId}${forkFiber.parentId ? ` (parent: ${forkFiber.parentId})` : ""} ${forkFiber.label ? `${forkFiber.label}` : ""}`;
    }
    case "fiber:interrupt":
      return `Fiber interrupted: ${event.fiberId}`;
    case "sleep:start":
      return `Sleep started: ${event.duration}ms (fiber: ${event.fiberId})`;
    case "sleep:end":
      return `Sleep ended (fiber: ${event.fiberId})`;
    case "retry:attempt":
      return `Retry attempt: #${event.attempt} ${event.label} (${formatError(event.lastError)})`;
  }
}

/** Get a color class based on event type */
function getEventColor(event: TraceEvent): string {
  switch (event.type) {
    case "effect:start":
      return "text-blue-400";
    case "effect:end":
      return event.result === "success" ? "text-green-400" : "text-red-400";
    case "fiber:fork":
      return "text-purple-400";
    case "fiber:end":
      return "text-purple-300";
    case "fiber:interrupt":
      return "text-orange-400";
    case "sleep:start":
    case "sleep:end":
      return "text-yellow-400";
    case "retry:attempt":
      return "text-orange-400";
  }
}

export function ExecutionLog() {
  const { events } = useTraceStore();
  const cardContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ref = cardContentRef.current;
    if (ref) {
      ref.scrollTo({
        top: ref.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [events]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        className={`
          shrink-0 pb-0
          md:pb-3
        `}
      >
        <CardTitle className="text-base">Execution Log</CardTitle>
        <CardDescription
          className={cn(events.length > 0 ? "hidden" : "block", "md:block")}
        >
          Step-by-step execution events
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {events.length === 0 ? (
          <div
            className={`
              flex h-full items-center justify-center text-center
              text-muted-foreground
            `}
          >
            <div>
              <p className="text-sm">No events logged</p>
              <p className="mt-1 text-xs">
                Events will appear here during execution
              </p>
            </div>
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto font-mono text-sm"
            ref={cardContentRef}
          >
            {events.map((event, index) => (
              <div
                key={`${event.type}-${event.timestamp}-${index}`}
                className={`
                  border-b border-border/50 py-1.5
                  last:border-b-0
                `}
              >
                <span className="text-muted-foreground">[{index + 1}]</span>{" "}
                <span className={getEventColor(event)}>
                  {formatEvent(event, events)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
