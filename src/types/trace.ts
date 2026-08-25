/**
 * Trace events for the Effect runtime visualizer.
 * These events represent the observable behavior of Effect programs.
 */

/** Event fired when an effect starts executing */
export interface EffectStartEvent {
  type: "effect:start";
  id: string;
  label: string;
  timestamp: number;
}

/** Event fired when an effect completes */
export type EffectEndEvent =
  | {
      type: "effect:end";
      id: string;
      result: "success";
      timestamp: number;
      value: unknown;
    }
  | {
      type: "effect:end";
      id: string;
      result: "failure";
      timestamp: number;
      error: unknown;
    };

export interface RetryAttemptEvent {
  type: "retry:attempt";
  id: string;
  label: string;
  attempt: number;
  lastError: unknown;
  timestamp: number;
}

/** Event fired when a fiber is forked */
export interface FiberForkEvent {
  type: "fiber:fork";
  fiberId: string;
  parentId?: string;
  label: string;
  timestamp: number;
}

/** Event fired when a fiber completes */
export interface FiberEndEvent {
  type: "fiber:end";
  fiberId: string;
  timestamp: number;
}

/** Event fired when a fiber is interrupted */
export interface FiberInterruptEvent {
  type: "fiber:interrupt";
  fiberId: string;
  timestamp: number;
}

export interface FiberSuspendEvent {
  type: "fiber:suspend";
  fiberId: string;
  timestamp: number;
}

export interface FiberResumeEvent {
  type: "fiber:resume";
  fiberId: string;
  timestamp: number;
}

/** Event fired when a finalizer is run */
export interface FinalizerEvent {
  type: "finalizer";
  id: string;
  label: string;
  timestamp: number;
}

/*
 * There is no release events (they are implicit in the finalizer event)
 * but we need to track the acquire event to know when the resource is acquired.
 */
type AcquireEvent =
  | {
      type: "acquire";
      result: "success";
      id: string;
      label: string;
      timestamp: number;
    }
  | {
      type: "acquire";
      result: "failure";
      id: string;
      label: string;
      error: unknown;
      timestamp: number;
    };

/**
 * Who caused an event: the program under observation, or the visualizer itself.
 *
 * Starting a run paused injects an `Effect.yieldNow()` before the program body,
 * and the runtime yields for real — so the trace contains a suspend and resume
 * pair that the program's author never wrote. Absent means `"program"`, which
 * keeps the common case unannotated.
 */
export type TraceOrigin = "program" | "tool";

type TraceEventBody =
  | EffectStartEvent
  | EffectEndEvent
  | FiberForkEvent
  | FiberEndEvent
  | FiberInterruptEvent
  | FiberSuspendEvent
  | FiberResumeEvent
  | RetryAttemptEvent
  | FinalizerEvent
  | AcquireEvent;

/**
 * Union type of all possible trace events.
 * This forms the event model for the visualizer.
 */
export type TraceEvent = TraceEventBody & { origin?: TraceOrigin };

/** Events with no origin are the program's, so only an explicit tag hides one. */
export function isToolEvent(event: TraceEvent): boolean {
  return event.origin === "tool";
}

/**
 * Possible states a fiber can be in.
 * Used by the FiberTreeView to show fiber lifecycle.
 */
export type FiberState = "running" | "suspended" | "completed" | "interrupted";

/**
 * Information about a fiber for visualization.
 * This is derived from TraceEvents but structured for the tree view.
 */
export interface FiberInfo {
  /** Unique fiber identifier */
  id: string;
  /** Parent fiber ID (undefined for root fiber) */
  parentId?: string;
  /** Current state of the fiber */
  state: FiberState;
  /** Human-readable label (optional) */
  label?: string;
  /** When the fiber was forked */
  startTime: number;
  /** When the fiber ended (if completed/interrupted) */
  endTime?: number;
  /** Child fiber IDs */
  children: string[];
}
