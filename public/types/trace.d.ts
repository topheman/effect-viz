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
/** Event fired when a sleep starts */
export interface SleepStartEvent {
  type: "sleep:start";
  fiberId: string;
  duration: number;
  timestamp: number;
}
/** Event fired when a sleep ends */
export interface SleepEndEvent {
  type: "sleep:end";
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
 * Union type of all possible trace events.
 * This forms the event model for the visualizer.
 */
export type TraceEvent =
  | EffectStartEvent
  | EffectEndEvent
  | FiberForkEvent
  | FiberEndEvent
  | FiberInterruptEvent
  | SleepStartEvent
  | SleepEndEvent
  | RetryAttemptEvent
  | FinalizerEvent
  | AcquireEvent;
/**
 * Type guard to check if an event is an effect event
 */
export declare function isEffectEvent(
  event: TraceEvent,
): event is EffectStartEvent | EffectEndEvent;
/**
 * Type guard to check if an event is a fiber event
 */
export declare function isFiberEvent(
  event: TraceEvent,
): event is FiberForkEvent | FiberEndEvent | FiberInterruptEvent;
/**
 * Type guard to check if an event is a sleep event
 */
export declare function isSleepEvent(
  event: TraceEvent,
): event is SleepStartEvent | SleepEndEvent;
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
export {};
