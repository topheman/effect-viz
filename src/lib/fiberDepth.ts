import type { TraceEvent } from "@/types/trace";

/**
 * Depth of every fiber in a trace, following `parentId` up to a root at 0.
 *
 * `parentId` is the fiber the supervisor names as parent: the one whose
 * FiberRefs the child inherits, which is the tree the fiber tree view draws too.
 * A fiber whose parent was never recorded (the supervisor skips layer fibers)
 * counts as a root.
 */
export function fiberDepths(
  events: readonly TraceEvent[],
): Map<string, number> {
  const depths = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "fiber:fork") continue;
    const parentDepth =
      event.parentId === undefined ? undefined : depths.get(event.parentId);
    depths.set(event.fiberId, parentDepth === undefined ? 0 : parentDepth + 1);
  }
  return depths;
}

/**
 * Depth to draw an event at: the fiber it ran on. A fork names the child but is
 * the parent's action, and the child only runs from its first resume.
 */
export function eventDepth(
  event: TraceEvent,
  depths: ReadonlyMap<string, number>,
): number {
  const fiberId = event.type === "fiber:fork" ? event.parentId : event.fiberId;
  return fiberId === undefined ? 0 : (depths.get(fiberId) ?? 0);
}
