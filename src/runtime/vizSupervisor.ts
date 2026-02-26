import {
  Supervisor,
  Effect,
  Option,
  Context,
  Fiber,
  FiberId,
  Exit,
} from "effect";

import type { TraceEvent } from "@/types/trace";

type OnEmit = (event: TraceEvent) => void;

/**
 * If the fiber has no context, it is a runtime fiber and we don't want to emit an event for it.
 */
function shouldIgnoreFiber(
  fiber: Fiber.RuntimeFiber<unknown, unknown>,
): boolean {
  return fiber.currentContext.unsafeMap.size === 0;
}

class VizSupervisor extends Supervisor.AbstractSupervisor<void> {
  value: Effect.Effect<void, never, never>;
  onEmit: OnEmit;
  constructor(onEmit: OnEmit) {
    super();
    this.value = Effect.void;
    this.onEmit = onEmit;
  }
  onStart<A, E, R>(
    _context: Context.Context<R>,
    _effect: Effect.Effect<A, E, R>,
    parent: Option.Option<Fiber.RuntimeFiber<unknown, unknown>>,
    fiber: Fiber.RuntimeFiber<A, E>,
  ): void {
    // console.log("onStart", {
    //   fiber,
    //   _context,
    //   _effect,
    //   parent,
    // });
    if (shouldIgnoreFiber(fiber)) {
      return;
    }
    const parentId = Option.match(parent, {
      onNone: () => undefined,
      onSome: (p) => FiberId.threadName(p.id()),
    });
    const fiberId = FiberId.threadName(fiber.id());
    this.onEmit({
      type: "fiber:fork",
      fiberId,
      parentId,
      label: fiberId,
      timestamp: Date.now(),
    });
  }
  onEnd<A, E>(exit: Exit.Exit<A, E>, fiber: Fiber.RuntimeFiber<A, E>): void {
    // console.log("onEnd", { exit, fiber });
    if (shouldIgnoreFiber(fiber)) {
      return;
    }
    const fiberId = FiberId.threadName(fiber.id());
    this.onEmit({
      type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
      fiberId,
      timestamp: Date.now(),
    });
  }
}

export function makeVizLayers(onEmit: OnEmit) {
  return Supervisor.addSupervisor(new VizSupervisor(onEmit));
}
