/**
 * Fiber lifecycle events (fork, suspend, resume, end, interrupt) read from the
 * Effect run loop through `Tracer.context`.
 *
 * Effect has no supervisor hook. What it does have is `Tracer.context`: the run
 * loop hands every primitive it evaluates to the tracer, together with the fiber
 * evaluating it, and the tracer evaluates it itself. Watching that stream tells
 * which fibers exist, which one is running, and when one stops. The pieces:
 *
 * - **Fork detection** (`discover`): a public fork (`forkChild`, `forkDetach`,
 *   `forkIn`, `forkScoped`) returns the child as its primitive's result before
 *   the child ever runs. An operator's own fork (`race`, `forEach` with
 *   concurrency, parallel finalizers) starts the child synchronously inside the
 *   parent's primitive instead, so the first we see of it is an unknown fiber
 *   while its parent is still on the stack. A fiber started with no fiber on the
 *   stack (`forEach` starts its next worker from the observer of the one that
 *   ended) gets the fiber that last forked with its `Context`: a child starts
 *   with its parent's.
 * - **End and interrupt**: `fiber.addObserver`, registered at discovery.
 * - **Suspend and resume**: a primitive returning the run loop's `Yield`
 *   sentinel stops the fiber, to wait or because it is done. A fiber that is
 *   done yields its `Exit`, and is not suspended: the runtime may still
 *   evaluate it once more, to interrupt the children it leaves, before it
 *   ends. Otherwise the fiber's next primitive is its resume.
 *
 * The run loop skips the tracer when the scheduler asks a fiber to yield, so a
 * forced yield (`Scheduler.shouldYield`) is neither a suspend nor a resume here:
 * the fiber was never off the CPU from the program's point of view.
 */
import { Context, Exit, Fiber } from "effect";
import type { Tracer } from "effect";

import type { Now } from "@/runtime/virtualClock";
import type { TraceEvent } from "@/types/trace";

type AnyFiber = Fiber.Fiber<unknown, unknown>;

/** Key under which a primitive evaluates itself; `Tracer.EffectPrimitive` types it. */
const EVALUATE = "~effect/Effect/evaluate";

/**
 * What a primitive returns to stop its fiber's run loop. The only runtime value
 * here that no public type declares; Effect registers it globally
 * (`internal/core.ts`).
 */
const YIELD = Symbol.for("effect/Effect/Yield");

/** What a fiber handed the run loop with its last `Yield`; an `Exit` when it is done (`FiberImpl.yieldWith`). */
const yieldedValue = (fiber: AnyFiber): unknown =>
  (fiber as unknown as { readonly _yielded: unknown })._yielded;

/** A fiber's id the way the visualizer prints it. */
export const fiberLabel = (fiber: { readonly id: number }): string =>
  `#${fiber.id}`;

/**
 * Whether a fiber belongs to the program rather than to the building of its
 * layers. `withViz` turns it off around the build only: the layer memo map
 * cannot tell them apart, since the context a layer provides carries it too.
 */
export const InProgram = Context.Reference<boolean>("effect-viz/InProgram", {
  defaultValue: () => true,
});

/** A fiber forked while the program's layers were being built. */
const isLayerBuild = (fiber: AnyFiber): boolean =>
  !Context.get(fiber.context, InProgram);

export interface FiberLifecycle {
  /** `Tracer.context`: evaluates the primitive and records what it did to its fiber. */
  readonly context: NonNullable<Tracer.Tracer["context"]>;
}

export function makeFiberLifecycle(
  onEmit: (event: TraceEvent) => void,
  now: Now,
): FiberLifecycle {
  /** Whether each known fiber is between a resume and a suspend. */
  const running = new Map<AnyFiber, boolean>();
  /** Fibers left out, those that build the program's layers. */
  const ignored = new WeakSet<AnyFiber>();
  /** The fiber that last forked with each Context, or else the first seen running with it: the parent fallback. */
  const contextOwner = new WeakMap<object, AnyFiber>();
  /** Fibers evaluating a primitive right now, innermost last. */
  const stack: AnyFiber[] = [];

  // ---- fork detection ----
  const discover = (fiber: AnyFiber, forker: AnyFiber | undefined) => {
    const owner = contextOwner.get(fiber.context);
    const parent = forker ?? (owner !== fiber ? owner : undefined);
    if (isLayerBuild(fiber)) {
      ignored.add(fiber);
      return;
    }
    // A child starts with its parent's Context, so the fiber that last forked
    // with it is the one whose operator starts the next fiber from an observer.
    if (forker !== undefined && forker.context === fiber.context) {
      contextOwner.set(fiber.context, forker);
    }
    // The root is discovered on its first primitive, so it is already running.
    running.set(fiber, parent === undefined);
    const fiberId = fiberLabel(fiber);
    onEmit({
      type: "fiber:fork",
      fiberId,
      parentId: parent && fiberLabel(parent),
      forkedBy: parent && fiberLabel(forker ?? parent),
      label: fiberId,
      timestamp: now(),
    });
    observeExit(fiber);
  };

  // ---- end and interrupt ----
  const observeExit = (fiber: AnyFiber) => {
    fiber.addObserver((exit) => {
      running.delete(fiber);
      onEmit({
        type: Exit.isSuccess(exit) ? "fiber:end" : "fiber:interrupt",
        fiberId: fiberLabel(fiber),
        timestamp: now(),
      });
    });
  };

  // ---- the hook ----
  const context = <X>(
    primitive: Tracer.EffectPrimitive<X>,
    fiber: AnyFiber,
  ): X => {
    if (ignored.has(fiber)) return primitive[EVALUATE](fiber);
    if (!running.has(fiber)) discover(fiber, innermostOther(fiber));
    if (ignored.has(fiber)) return primitive[EVALUATE](fiber);
    if (!contextOwner.has(fiber.context)) {
      contextOwner.set(fiber.context, fiber);
    }

    if (running.get(fiber) === false) {
      running.set(fiber, true);
      onEmit({
        type: "fiber:resume",
        fiberId: fiberLabel(fiber),
        timestamp: now(),
      });
    }

    stack.push(fiber);
    let result: X;
    try {
      result = primitive[EVALUATE](fiber);
    } finally {
      stack.pop();
    }

    if (result === YIELD) {
      // A fiber yielding its Exit is ending, and its observer may have run
      // already, inside the evaluation.
      if (running.get(fiber) === true && !Exit.isExit(yieldedValue(fiber))) {
        running.set(fiber, false);
        onEmit({
          type: "fiber:suspend",
          fiberId: fiberLabel(fiber),
          timestamp: now(),
        });
      }
    } else if (
      Exit.isExit(result) &&
      Exit.isSuccess(result) &&
      Fiber.isFiber(result.value) &&
      !running.has(result.value) &&
      !ignored.has(result.value)
    ) {
      discover(result.value, fiber);
    }
    return result;
  };

  /** The fiber whose primitive is starting `fiber`, if one is on the stack. */
  const innermostOther = (fiber: AnyFiber): AnyFiber | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i] !== fiber) return stack[i];
    }
    return undefined;
  };

  return { context };
}
