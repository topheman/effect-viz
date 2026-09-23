import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useShowInternals } from "@/hooks/useShowInternals";
import { eventDepth, fiberDepths } from "@/lib/fiberDepth";
import { traceHints } from "@/lib/traceHints";
import { cn } from "@/lib/utils";
import { isToolEvent } from "@/runtime/traceOrigin";
import { useTraceStore } from "@/stores/traceStore";
import type {
  EffectStartEvent,
  FiberForkEvent,
  FiberSuspendEvent,
  TraceEvent,
} from "@/types/trace";

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  if (typeof err === "string") return err;
  if (err && typeof err === "object") return JSON.stringify(err);
  return String(err);
}

/** Format duration in ms as human-readable string */
function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 1000) return `${Math.round(clamped)}ms`;
  return `${(clamped / 1000).toFixed(2)}s`;
}

/** Format a trace event into a human-readable string */
function formatEvent(
  event: TraceEvent,
  events: TraceEvent[],
  currentIndex?: number,
): string {
  switch (event.type) {
    case "effect:start":
      return `effect:started ${event.label}`;
    case "effect:end": {
      const startEffect = events.find(
        (e) => e.type === "effect:start" && e.id === event.id,
      ) as EffectStartEvent | undefined;
      return `effect:ended ${startEffect?.label ?? event.id}`;
    }
    case "fiber:fork": {
      if (!event.parentId) return `fiber:forked ${event.fiberId} (root)`;
      const by =
        event.forkedBy && event.forkedBy !== event.parentId
          ? `, by ${event.forkedBy}`
          : "";
      return `fiber:forked ${event.fiberId} (parent ${event.parentId}${by})`;
    }
    case "fiber:end": {
      const forkEvent = events.find(
        (e) => e.type === "fiber:fork" && e.fiberId === event.fiberId,
      ) as FiberForkEvent | undefined;
      return `fiber:ended ${event.fiberId}${forkEvent?.parentId ? ` (parent ${forkEvent.parentId})` : " (root)"}`;
    }
    case "fiber:interrupt":
      return `fiber:interrupted ${event.fiberId}`;
    case "fiber:suspend":
      return `fiber:suspend ${event.fiberId}`;
    case "fiber:resume": {
      const priorEvents =
        currentIndex !== undefined ? events.slice(0, currentIndex) : events;
      const lastSuspend = [...priorEvents]
        .reverse()
        .find(
          (e): e is FiberSuspendEvent =>
            e.type === "fiber:suspend" && e.fiberId === event.fiberId,
        );
      if (!lastSuspend) return `fiber:resume ${event.fiberId}`;
      const durationMs = event.timestamp - lastSuspend.timestamp;
      return `fiber:resume ${event.fiberId} (after ${formatDuration(durationMs)})`;
    }
    case "retry:attempt":
      return `retry:attempt #${event.attempt} ${event.label} (${formatError(event.lastError)})`;
    case "finalizer":
      return `finalizer ${event.label}`;
    case "acquire":
      return event.result === "success"
        ? `acquire ${event.label}`
        : `acquire:failed ${event.label} (${formatError(event.error)})`;
  }
}

/** Get emoji and accessible label for an event */
function getEventEmoji(event: TraceEvent): { emoji: string; label: string } {
  switch (event.type) {
    case "fiber:fork":
      return { emoji: "⚡", label: "Fiber forked" };
    case "fiber:suspend":
      return { emoji: "⏸️", label: "Fiber suspend" };
    case "fiber:resume":
      return { emoji: "▶️", label: "Fiber resume" };
    case "fiber:end":
      return { emoji: "🏁", label: "Fiber ended" };
    case "fiber:interrupt":
      return { emoji: "⛔", label: "Fiber interrupted" };
    case "effect:start":
      return { emoji: "🚀", label: "Effect started" };
    case "effect:end":
      return {
        emoji: event.result === "success" ? "✅" : "❌",
        label:
          event.result === "success"
            ? "Effect ended (success)"
            : "Effect ended (failure)",
      };
    case "retry:attempt":
      return { emoji: "🔄", label: "Retry attempt" };
    case "finalizer":
      return { emoji: "🧹", label: "Finalizer" };
    case "acquire":
      return {
        emoji: "📦",
        label:
          event.result === "success"
            ? "Resource acquired"
            : "Resource acquire failed",
      };
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
      return "text-violet-500";
    case "fiber:end":
      return "text-violet-400";
    case "fiber:interrupt":
      return "text-orange-400";
    case "fiber:suspend":
      return "text-amber-500";
    case "fiber:resume":
      return "text-amber-400";
    case "retry:attempt":
      return "text-orange-400";
    case "finalizer":
      return "text-cyan-400";
    case "acquire":
      return event.result === "success" ? "text-cyan-300" : "text-red-400";
  }
}

export function ExecutionLog() {
  const { events } = useTraceStore();
  const [showInternals, setShowInternals] = useShowInternals();
  const [indentByFiber, setIndentByFiber] = useState(false);
  const [explain, setExplain] = useState(false);
  // Keyed by the run's first event: row indices mean nothing in the next run.
  const [open, setOpen] = useState<{
    run: TraceEvent | undefined;
    rows: ReadonlySet<number>;
  }>({ run: undefined, rows: new Set() });
  const expanded = open.run === events[0] ? open.rows : new Set<number>();
  const cardContentRef = useRef<HTMLDivElement>(null);

  const toolEventCount = events.filter(isToolEvent).length;
  // Positions in the full list are kept: formatEvent pairs an event with its
  // start, and a duration measured against a filtered list would be wrong.
  const visible = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => showInternals || !isToolEvent(event));
  const depths = indentByFiber ? fiberDepths(events) : null;
  // Detected on the full trace, so hiding rows never changes which hints fire.
  const hints = explain ? traceHints(events, { indentByFiber }) : null;

  const toggleHint = (index: number) => {
    const next = new Set(expanded);
    if (!next.delete(index)) next.add(index);
    setOpen({ run: events[0], rows: next });
  };
  const indexWidth = `${String(visible.length).length + 2}ch`;

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
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Execution Log</CardTitle>
          <div className="flex items-center gap-3">
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => setExplain(!explain)}
                className={`
                  shrink-0 cursor-pointer text-xs text-muted-foreground
                  transition-colors
                  hover:text-foreground
                `}
              >
                {explain ? "hide hints" : "explain"}
              </button>
            )}
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => setIndentByFiber(!indentByFiber)}
                className={`
                  shrink-0 cursor-pointer text-xs text-muted-foreground
                  transition-colors
                  hover:text-foreground
                `}
              >
                {indentByFiber ? "flat log" : "indent by fiber"}
              </button>
            )}
            {toolEventCount > 0 && (
              <button
                type="button"
                onClick={() => setShowInternals(!showInternals)}
                className={`
                  shrink-0 cursor-pointer text-xs text-muted-foreground
                  transition-colors
                  hover:text-foreground
                `}
              >
                {showInternals
                  ? "hide visualizer events"
                  : `show ${toolEventCount} visualizer event${toolEventCount > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
        <CardDescription
          className={cn(events.length > 0 ? "hidden" : "block", "md:block")}
        >
          Step-by-step execution events
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {visible.length === 0 ? (
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
            {visible.map(({ event, index }, position) => {
              const emojiInfo = getEventEmoji(event);
              const depth = depths ? eventDepth(event, depths) : 0;
              const hint = hints?.get(index);
              const hintId = `execution-log-hint-${index}`;
              return (
                <div
                  key={`${event.type}-${event.timestamp}-${index}`}
                  className={cn(
                    `
                      border-b border-border/50 py-1.5
                      last:border-b-0
                    `,
                    // Dimmed rather than styled apart: it is a real event that
                    // really happened, just not one the program asked for.
                    isToolEvent(event) && "opacity-60",
                  )}
                >
                  {/* Flex so a wrapped line keeps the indent too. */}
                  <div className={cn(depths && "flex gap-[1ch]")}>
                    <span
                      className={cn(
                        "text-muted-foreground",
                        depths && "shrink-0",
                      )}
                      // As wide as the longest label, so equal depths line up
                      // and depth 0 starts where the flat log does.
                      style={depths ? { minWidth: indexWidth } : undefined}
                    >
                      [{position + 1}]
                    </span>{" "}
                    <span style={{ paddingInlineStart: `${depth * 16}px` }}>
                      <span
                        role="img"
                        aria-label={emojiInfo.label}
                        className="me-1.5 inline-block"
                      >
                        {emojiInfo.emoji}
                      </span>
                      <span className={getEventColor(event)}>
                        {formatEvent(event, events, index)}
                      </span>
                      {hint && (
                        <button
                          type="button"
                          aria-label="Explain this event"
                          aria-expanded={expanded.has(index)}
                          aria-controls={
                            expanded.has(index) ? hintId : undefined
                          }
                          onClick={() => toggleHint(index)}
                          className={`
                            ms-1.5 inline-flex cursor-pointer align-middle
                            text-muted-foreground transition-colors
                            hover:text-foreground
                          `}
                        >
                          <Info className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                  {hint && expanded.has(index) && (
                    <p
                      id={hintId}
                      className="mt-0.5 font-sans text-xs text-muted-foreground"
                      style={{
                        paddingInlineStart: `calc(${indexWidth} + 1ch + ${depth * 16}px)`,
                      }}
                    >
                      {hint}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
