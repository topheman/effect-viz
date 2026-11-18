import type {
  FiberEndEvent,
  FiberInterruptEvent,
  FiberState,
} from "@/types/trace";

/** The state a fiber is left in by the event that ends it. */
export function endState(
  event: FiberEndEvent | FiberInterruptEvent,
): FiberState {
  if (event.type === "fiber:interrupt") return "interrupted";
  return event.result === "success" ? "completed" : "failed";
}

/** Whether a fiber in this state has ended, whatever the way. */
export function isEnded(state: FiberState): boolean {
  return state === "completed" || state === "failed" || state === "interrupted";
}
