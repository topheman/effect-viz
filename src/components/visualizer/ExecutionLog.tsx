import { Info, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLogView } from "@/hooks/useLogView";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useShowInternals } from "@/hooks/useShowInternals";
import { EVENT_GROUPS, type EventGroup, eventGroup } from "@/lib/eventGroups";
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

function OptionRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    // Tall enough on touch to hit reliably; the whole row is the target.
    <label
      className={`
        flex min-h-10 cursor-pointer items-center gap-2
        md:min-h-7
      `}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      <span className="flex-1">{label}</span>{" "}
      {count !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </label>
  );
}

export function ExecutionLog() {
  const { events } = useTraceStore();
  const [showInternals, setShowInternals] = useShowInternals();
  const [{ indentByFiber, explain, hidden }, updateView] = useLogView();
  const { currentStep: onboardingStep, completeStep } = useOnboarding();
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
    .filter(({ event }) => showInternals || !isToolEvent(event))
    .filter(({ event }) => !hidden.has(eventGroup(event)));
  const hiddenCount = events.length - visible.length;
  const groupCounts = new Map<EventGroup, number>();
  for (const event of events) {
    if (!showInternals && isToolEvent(event)) continue;
    const group = eventGroup(event);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }
  const toggleGroup = (group: EventGroup) => {
    const next = new Set(hidden);
    if (!next.delete(group)) next.add(group);
    updateView({ hidden: next });
  };
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
    <Card
      className={`
        relative flex h-full flex-col
        max-md:short:py-1
      `}
    >
      {/* In the landscape tabs the options button floats over the rows; the
          header's inline-size container would otherwise size it to zero. */}
      <CardHeader
        className={`
          shrink-0 pb-0
          md:pb-3
          max-md:short:[container-type:normal] max-md:short:absolute
          max-md:short:top-2.5 max-md:short:right-2.5 max-md:short:z-10
          max-md:short:px-0
        `}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle
            className={`
              text-base
              max-md:short:hidden
            `}
          >
            Execution Log
          </CardTitle>
          <Popover
            onOpenChange={(isOpen) => {
              if (isOpen) completeStep("logOptions");
            }}
          >
            <PopoverTrigger
              data-onboarding-step="logOptions"
              aria-label={
                hiddenCount > 0
                  ? `Log options, ${hiddenCount} hidden`
                  : "Log options"
              }
              className={cn(
                `
                  -m-1.5 inline-flex shrink-0 cursor-pointer items-center
                  gap-1.5 rounded-md p-1.5 text-xs text-muted-foreground
                  transition-colors
                  hover:text-foreground
                  max-md:short:bg-card
                `,
                onboardingStep === "logOptions" && "animate-onboarding-glow",
              )}
            >
              {hiddenCount > 0 && <span aria-hidden>{hiddenCount} hidden</span>}
              <SlidersHorizontal className="size-4" aria-hidden />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 space-y-3 text-sm">
              <fieldset>
                <legend className="mb-1 text-xs text-muted-foreground">
                  View
                </legend>
                <OptionRow
                  label="Indent by fiber"
                  checked={indentByFiber}
                  onChange={() => updateView({ indentByFiber: !indentByFiber })}
                />
                <OptionRow
                  label="Explain events"
                  checked={explain}
                  onChange={() => updateView({ explain: !explain })}
                />
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-xs text-muted-foreground">
                  Show
                </legend>
                {EVENT_GROUPS.map(({ group, label }) => (
                  <OptionRow
                    key={group}
                    label={label}
                    count={groupCounts.get(group) ?? 0}
                    checked={!hidden.has(group)}
                    onChange={() => toggleGroup(group)}
                  />
                ))}
                <OptionRow
                  label="Visualizer events"
                  count={toolEventCount}
                  checked={showInternals}
                  onChange={() => setShowInternals(!showInternals)}
                />
              </fieldset>
            </PopoverContent>
          </Popover>
        </div>
        <CardDescription
          className={cn(
            events.length > 0 ? "hidden" : "block",
            `
              md:block
              max-md:short:hidden
            `,
          )}
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
          // Rows wrap, so nothing needs a horizontal scroll; hidden stops an
          // icon's widened hit area near the edge from creating one.
          <div
            className={`
              h-full overflow-x-hidden overflow-y-auto font-mono text-sm
            `}
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
                  // On touch devices a tap anywhere on the row toggles its hint:
                  // the icon is too small a target for a finger. The browser
                  // sends no click once a touch turns into a scroll. With a
                  // mouse only the icon does, so selecting text in a row by
                  // dragging does not toggle it.
                  onClick={
                    hint
                      ? (e) => {
                          if (!matchMedia("(pointer: coarse)").matches) return;
                          if ((e.target as Element).closest("button")) return;
                          toggleHint(index);
                        }
                      : undefined
                  }
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
                          title={
                            expanded.has(index)
                              ? "Hide explanation"
                              : "Explain this event"
                          }
                          aria-expanded={expanded.has(index)}
                          aria-controls={
                            expanded.has(index) ? hintId : undefined
                          }
                          onClick={() => toggleHint(index)}
                          // The ::after layer widens the hit area around the icon
                          // without moving it.
                          className={`
                            relative ms-1.5 inline-flex cursor-pointer
                            align-middle text-muted-foreground transition-colors
                            after:absolute after:-inset-x-3 after:-inset-y-1.5
                            after:content-['']
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
