/**
 * Trace events for the Effect runtime visualizer.
 * These events represent the observable behavior of Effect programs.
 */

/** Event fired when an effect starts executing */
export interface EffectStartEvent {
  type: "effect:start";
  id: string;
  label: string;
  timestamp?: number;
}

/** Event fired when an effect completes */
export interface EffectEndEvent {
  type: "effect:end";
  id: string;
  result: "success" | "failure";
  timestamp?: number;
  error?: unknown;
  value?: unknown;
}

/** Event fired when a fiber is forked */
export interface FiberForkEvent {
  type: "fiber:fork";
  fiberId: string;
  parentId?: string;
  timestamp?: number;
}

/** Event fired when a fiber completes */
export interface FiberEndEvent {
  type: "fiber:end";
  fiberId: string;
  timestamp?: number;
}

/** Event fired when a fiber is interrupted */
export interface FiberInterruptEvent {
  type: "fiber:interrupt";
  fiberId: string;
  timestamp?: number;
}

/** Event fired when a sleep starts */
export interface SleepStartEvent {
  type: "sleep:start";
  fiberId: string;
  duration: number;
  timestamp?: number;
}

/** Event fired when a sleep ends */
export interface SleepEndEvent {
  type: "sleep:end";
  fiberId: string;
  timestamp?: number;
}

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
  | SleepEndEvent;

/**
 * Type guard to check if an event is an effect event
 */
export function isEffectEvent(
  event: TraceEvent,
): event is EffectStartEvent | EffectEndEvent {
  return event.type === "effect:start" || event.type === "effect:end";
}

/**
 * Type guard to check if an event is a fiber event
 */
export function isFiberEvent(
  event: TraceEvent,
): event is FiberForkEvent | FiberEndEvent | FiberInterruptEvent {
  return (
    event.type === "fiber:fork" ||
    event.type === "fiber:end" ||
    event.type === "fiber:interrupt"
  );
}

/**
 * Type guard to check if an event is a sleep event
 */
export function isSleepEvent(
  event: TraceEvent,
): event is SleepStartEvent | SleepEndEvent {
  return event.type === "sleep:start" || event.type === "sleep:end";
}
