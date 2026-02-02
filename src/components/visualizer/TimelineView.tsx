import { useEffect, useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTraceStore } from "@/stores/traceStore";
import type { FiberState, TraceEvent } from "@/types/trace";

// =============================================================================
// Types
// =============================================================================

interface TimelineSegment {
  fiberId: string;
  state: FiberState;
  startTime: number;
  endTime: number | null; // null means still ongoing
}

interface FiberLane {
  fiberId: string;
  label: string;
  segments: TimelineSegment[];
}

// =============================================================================
// Timeline Logic
// =============================================================================

const DEFAULT_DURATION_MS = 3000; // Default 3 second view

/**
 * Build timeline segments from trace events.
 * Each segment represents a period where a fiber was in a specific state.
 */
function buildTimelineSegments(events: TraceEvent[]): FiberLane[] {
  const lanes = new Map<string, FiberLane>();
  const fiberStates = new Map<string, { state: FiberState; since: number }>();

  for (const event of events) {
    const timestamp = event.timestamp ?? 0;

    switch (event.type) {
      case "fiber:fork": {
        // Create a new lane for this fiber
        lanes.set(event.fiberId, {
          fiberId: event.fiberId,
          label: event.label ?? event.fiberId,
          segments: [],
        });
        // Start in running state
        fiberStates.set(event.fiberId, { state: "running", since: timestamp });
        break;
      }

      case "sleep:start": {
        const lane = lanes.get(event.fiberId);
        const currentState = fiberStates.get(event.fiberId);
        if (lane && currentState) {
          // Close the running segment
          lane.segments.push({
            fiberId: event.fiberId,
            state: currentState.state,
            startTime: currentState.since,
            endTime: timestamp,
          });
          // Start suspended segment
          fiberStates.set(event.fiberId, {
            state: "suspended",
            since: timestamp,
          });
        }
        break;
      }

      case "sleep:end": {
        const lane = lanes.get(event.fiberId);
        const currentState = fiberStates.get(event.fiberId);
        if (lane && currentState) {
          // Close the suspended segment
          lane.segments.push({
            fiberId: event.fiberId,
            state: currentState.state,
            startTime: currentState.since,
            endTime: timestamp,
          });
          // Back to running
          fiberStates.set(event.fiberId, {
            state: "running",
            since: timestamp,
          });
        }
        break;
      }

      case "fiber:end": {
        const lane = lanes.get(event.fiberId);
        const currentState = fiberStates.get(event.fiberId);
        if (lane && currentState) {
          // Close the current segment
          lane.segments.push({
            fiberId: event.fiberId,
            state: currentState.state,
            startTime: currentState.since,
            endTime: timestamp,
          });
          // Mark fiber as completed (no longer ongoing)
          fiberStates.set(event.fiberId, {
            state: "completed",
            since: timestamp,
          });
        }
        break;
      }

      case "fiber:interrupt": {
        const lane = lanes.get(event.fiberId);
        const currentState = fiberStates.get(event.fiberId);
        if (lane && currentState) {
          // Close the current segment
          lane.segments.push({
            fiberId: event.fiberId,
            state: currentState.state,
            startTime: currentState.since,
            endTime: timestamp,
          });
          // Mark fiber as interrupted (no longer ongoing)
          fiberStates.set(event.fiberId, {
            state: "interrupted",
            since: timestamp,
          });
        }
        break;
      }
    }
  }

  // Add ongoing segments for fibers still running/suspended
  // OR add final state markers for completed/interrupted fibers
  for (const [fiberId, state] of fiberStates) {
    const lane = lanes.get(fiberId);
    if (!lane) continue;

    if (state.state === "running" || state.state === "suspended") {
      // Fiber still active - show ongoing segment
      lane.segments.push({
        fiberId,
        state: state.state,
        startTime: state.since,
        endTime: null, // ongoing
      });
    } else if (state.state === "completed" || state.state === "interrupted") {
      // Fiber finished - add a small marker segment to show final state
      // Use a minimal duration so it's visible as a cap at the end
      lane.segments.push({
        fiberId,
        state: state.state,
        startTime: state.since,
        endTime: state.since, // zero-width, will be rendered with min-width
      });
    }
  }

  return Array.from(lanes.values());
}

/**
 * Get color classes for a fiber state
 */
function getSegmentColor(state: FiberState): string {
  switch (state) {
    case "running":
      return "bg-green-500";
    case "suspended":
      return "bg-yellow-500";
    case "completed":
      return "bg-blue-500";
    case "interrupted":
      return "bg-red-500";
  }
}

// =============================================================================
// Components
// =============================================================================

function TimeAxis({ duration }: { duration: number }) {
  // Generate tick marks at reasonable intervals
  const tickInterval = duration <= 1000 ? 200 : duration <= 3000 ? 500 : 1000;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += tickInterval) {
    ticks.push(t);
  }

  // Format time label
  const formatTime = (ms: number) => {
    if (ms === 0) return "0s";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  return (
    <div className="flex items-start gap-2 pt-1">
      {/* Spacer to align with fiber labels */}
      <div className="w-24 shrink-0" />

      {/* Time axis bar */}
      <div className="relative h-6 flex-1 border-t border-border">
        {ticks.map((t) => {
          const left = (t / duration) * 100;
          return (
            <div
              key={t}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${left}%`, transform: "translateX(-50%)" }}
            >
              <div className="h-2 w-px bg-border" />
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {formatTime(t)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FiberLaneRow({
  lane,
  startTime,
  duration,
  now,
}: {
  lane: FiberLane;
  startTime: number;
  duration: number;
  now: number;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {/* Fiber label */}
      <div
        className={`
          w-24 shrink-0 truncate text-right font-mono text-xs
          text-muted-foreground
        `}
      >
        {lane.label}
      </div>

      {/* Timeline bar */}
      <div className="relative h-4 flex-1 rounded bg-muted/30">
        {lane.segments.map((segment, i) => {
          const segmentStart = segment.startTime - startTime;
          const segmentEnd = segment.endTime
            ? segment.endTime - startTime
            : now - startTime;

          const left = (segmentStart / duration) * 100;
          const segmentDuration = segmentEnd - segmentStart;
          const width = (segmentDuration / duration) * 100;

          // Final state markers (completed/interrupted) have zero duration
          // Give them a minimum width so they're visible
          const isFinalMarker =
            segment.state === "completed" || segment.state === "interrupted";
          const isOngoing = segment.endTime === null;

          return (
            <div
              key={i}
              className={cn(
                "absolute top-0 h-full rounded",
                getSegmentColor(segment.state),
                isOngoing && "animate-pulse",
                isFinalMarker && "min-w-2", // minimum 8px width for visibility
              )}
              style={{
                left: `${Math.max(0, left)}%`,
                width: isFinalMarker
                  ? undefined
                  : `${Math.min(100 - left, width)}%`,
              }}
              title={
                isFinalMarker
                  ? segment.state
                  : `${segment.state}: ${Math.round(segmentDuration)}ms`
              }
            />
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TimelineView() {
  const { events } = useTraceStore();
  const [now, setNow] = useState(() => Date.now());

  // Build timeline data
  const lanes = useMemo(() => buildTimelineSegments(events), [events]);

  // Check if there are any ongoing segments (for real-time updates)
  const hasOngoingSegments = useMemo(() => {
    return lanes.some((lane) =>
      lane.segments.some((segment) => segment.endTime === null),
    );
  }, [lanes]);

  // Real-time update: refresh `now` every 50ms while there are ongoing segments
  useEffect(() => {
    if (!hasOngoingSegments) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 50);

    return () => clearInterval(interval);
  }, [hasOngoingSegments]);

  // Calculate time range
  const timeRange = useMemo(() => {
    if (events.length === 0) return null;

    const timestamps = events
      .map((e) => e.timestamp)
      .filter((t): t is number => t !== undefined);

    if (timestamps.length === 0) return null;

    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);
    const elapsed = endTime - startTime;

    // Auto-scale: use default duration or actual elapsed time (whichever is larger)
    // For ongoing segments, use current time instead of last event
    const currentElapsed = hasOngoingSegments ? now - startTime : elapsed;
    const duration = Math.max(DEFAULT_DURATION_MS, currentElapsed + 500); // +500ms padding

    return { startTime, duration };
  }, [events, hasOngoingSegments, now]);

  const hasData = lanes.length > 0 && timeRange;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        className={`
          shrink-0 pb-0
          md:pb-3
        `}
      >
        <CardTitle className="text-base">Timeline</CardTitle>
        <CardDescription
          className={cn(hasData ? "hidden" : "block", "md:block")}
        >
          Visualize concurrency, delays, and scheduling
        </CardDescription>
      </CardHeader>
      <CardContent
        className={`
          flex min-h-0 flex-1 flex-col overflow-hidden
          ${!hasData ? "items-center justify-center" : ""}
        `}
      >
        {!hasData ? (
          <div className="text-center text-muted-foreground">
            <p className="text-sm">No events to display</p>
            <p className="mt-1 text-xs">
              Run an Effect program to see the timeline
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Legend */}
            <div className="mb-2 flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 rounded bg-green-500" />
                <span className="text-muted-foreground">Running</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 rounded bg-yellow-500" />
                <span className="text-muted-foreground">Suspended</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 rounded bg-blue-500" />
                <span className="text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-3 rounded bg-red-500" />
                <span className="text-muted-foreground">Interrupted</span>
              </div>
            </div>

            {/* Fiber lanes */}
            <div className="flex-1 overflow-y-auto">
              {lanes.map((lane) => (
                <FiberLaneRow
                  key={lane.fiberId}
                  lane={lane}
                  startTime={timeRange.startTime}
                  duration={timeRange.duration}
                  now={now}
                />
              ))}
            </div>

            {/* Time axis */}
            <TimeAxis duration={timeRange.duration} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
