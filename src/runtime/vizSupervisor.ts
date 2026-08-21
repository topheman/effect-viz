import {
  Supervisor,
  Effect,
  Option,
  Context,
  Fiber,
  FiberId,
  Exit,
} from "effect";

import type { Now } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

type OnEmit = (event: TraceEvent) => void;

/**
 * Ignore fibers that are internal to the Effect runtime:
 * - Empty context: cleanup-like internal operations
 * - Only effect/Layer/CurrentMemoMap: layer build/memoization fibers (created when
 *   Effect.provide(layers) evaluates Layer.mergeAll before the user's program runs)
 *
 * We cannot identify fibers created by Effect.race, Effect.all, etc.
 */
function shouldIgnoreFiber(
  fiber: Fiber.RuntimeFiber<unknown, unknown>,
): boolean {
  const keys = Array.from(fiber.currentContext.unsafeMap.keys());
  return (
    keys.length === 0 || keys.every((k) => k === "effect/Layer/CurrentMemoMap")
  );
}

class VizSupervisor extends Supervisor.AbstractSupervisor<void> {
  value: Effect.Effect<void, never, never>;
  onEmit: OnEmit;
  /** Supervisor callbacks are synchronous and outside any Effect, so virtual
   * time has to be handed in rather than read from the Clock service. */
  now: Now;
  constructor(onEmit: OnEmit, now: Now) {
    super();
    this.value = Effect.void;
    this.onEmit = onEmit;
    this.now = now;
  }
  onStart<A, E, R>(
    _context: Context.Context<R>,
    _effect: Effect.Effect<A, E, R>,
    parent: Option.Option<Fiber.RuntimeFiber<unknown, unknown>>,
    fiber: Fiber.RuntimeFiber<A, E>,
  ): void {
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
      timestamp: this.now(),
    });
  }
  onEnd<A, E>(exit: Exit.Exit<A, E>, fiber: Fiber.RuntimeFiber<A, E>): void {
    if (shouldIgnoreFiber(fiber)) {
      return;
    }
    const fiberId = FiberId.threadName(fiber.id());
    this.onEmit({
      type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
      fiberId,
      timestamp: this.now(),
    });
  }
  onSuspend<A, E>(fiber: Fiber.RuntimeFiber<A, E>): void {
    if (shouldIgnoreFiber(fiber)) {
      return;
    }
    const fiberId = FiberId.threadName(fiber.id());
    this.onEmit({
      type: "fiber:suspend",
      fiberId,
      timestamp: this.now(),
    });
  }
  onResume<A, E>(fiber: Fiber.RuntimeFiber<A, E>): void {
    if (shouldIgnoreFiber(fiber)) {
      return;
    }
    const fiberId = FiberId.threadName(fiber.id());
    this.onEmit({
      type: "fiber:resume",
      fiberId,
      timestamp: this.now(),
    });
  }
}

export function makeVizLayers(onEmit: OnEmit, now: Now) {
  return Supervisor.addSupervisor(new VizSupervisor(onEmit, now));
}
