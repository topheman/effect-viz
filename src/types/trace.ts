/**
 * Trace events for the Effect runtime visualizer.
 * These events represent the observable behavior of Effect programs.
 */

/** Event fired when an effect starts executing */
export interface EffectStartEvent {
  type: "effect:start";
  id: string;
  /** Fiber the event was emitted on, as `fiberLabel` prints it */
  fiberId: string;
  label: string;
  timestamp: number;
}

/** Event fired when an effect completes */
export type EffectEndEvent =
  | {
      type: "effect:end";
      id: string;
      fiberId: string;
      result: "success";
      timestamp: number;
      value: unknown;
    }
  | {
      type: "effect:end";
      id: string;
      fiberId: string;
      result: "failure";
      timestamp: number;
      error: unknown;
    };

export interface RetryAttemptEvent {
  type: "retry:attempt";
  id: string;
  fiberId: string;
  label: string;
  attempt: number;
  lastError: unknown;
  timestamp: number;
}

/** Event fired when a fiber is forked */
export interface FiberForkEvent {
  type: "fiber:fork";
  fiberId: string;
  /** Fiber that ran the fork, or else the one whose `Context` the child starts with. Absent for the root. */
  parentId?: string;
  label: string;
  timestamp: number;
}

/** Event fired when a fiber succeeds or fails on its own */
export interface FiberEndEvent {
  type: "fiber:end";
  fiberId: string;
  /** `"failure"` when the fiber failed or died, its cause holding more than interrupts */
  result: "success" | "failure";
  timestamp: number;
}

/** Event fired when a fiber is interrupted, its cause holding only interrupts */
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
  fiberId: string;
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
      fiberId: string;
      label: string;
      timestamp: number;
    }
  | {
      type: "acquire";
      result: "failure";
      id: string;
      fiberId: string;
      label: string;
      error: unknown;
      timestamp: number;
    };

/**
 * Who wrote a line on the WebContainer's stdout: the program, or the visualizer,
 * whose control commands the process's terminal echoes back.
 */
export type TraceOrigin = "program" | "tool";

/**
 * Union type of all possible trace events.
 * This forms the event model for the visualizer.
 */
export type TraceEvent =
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
 * Possible states a fiber can be in.
 * Used by the FiberTreeView to show fiber lifecycle.
 */
export type FiberState =
  | "running"
  | "suspended"
  | "completed"
  | "failed"
  | "interrupted";

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
  /** When the fiber ended (if completed, failed or interrupted) */
  endTime?: number;
  /** Child fiber IDs */
  children: string[];
}
