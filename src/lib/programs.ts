/**
 * Example programs for the EffectFlow visualizer.
 * These demonstrate different Effect patterns with tracing.
 */

import { Effect, Fiber, Ref } from "effect";

import {
  addFinalizerWithTrace,
  acquireReleaseWithTrace,
  forkWithTrace,
  withTrace,
  sleepWithTrace,
  retryWithTrace,
} from "@/runtime/tracedRunner";

// =============================================================================
// Basic Example: Sequential + Concurrent Execution
// =============================================================================

/**
 * A basic example that demonstrates:
 * - Sequential effect execution with withTrace
 * - Concurrent fiber execution with forkWithTrace
 * - Fiber joining (waiting for completion)
 */
export const basicExample = Effect.gen(function* () {
  // Step 1: Sequential initialization
  yield* withTrace(
    Effect.sync(() => console.log("Initializing...")),
    "initialization",
  );

  // Step 2: Fork two concurrent workers
  const worker1 = yield* forkWithTrace(
    withTrace(
      sleepWithTrace("1 second").pipe(Effect.as("Worker 1 complete")),
      "worker-1-task",
    ),
    "worker-1",
  );

  const worker2 = yield* forkWithTrace(
    withTrace(
      sleepWithTrace("1.5 seconds").pipe(Effect.as("Worker 2 complete")),
      "worker-2-task",
    ),
    "worker-2",
  );

  // Step 3: Wait for both workers
  const result1 = yield* withTrace(Fiber.join(worker1), "join-worker-1");
  const result2 = yield* withTrace(Fiber.join(worker2), "join-worker-2");

  // Step 4: Final step
  yield* withTrace(
    Effect.sync(() => console.log("All workers done!")),
    "finalization",
  );

  return { result1, result2 };
});

// =============================================================================
// Multi-Step Worker Example
// =============================================================================

/**
 * Demonstrates a fiber that performs multiple sequential steps.
 */
export const multiStepExample = Effect.gen(function* () {
  const worker = yield* forkWithTrace(
    Effect.gen(function* () {
      yield* withTrace(sleepWithTrace("500 millis"), "step-1-prepare");
      yield* withTrace(sleepWithTrace("500 millis"), "step-2-process");
      yield* withTrace(sleepWithTrace("500 millis"), "step-3-cleanup");
      return "Multi-step complete";
    }),
    "multi-step-worker",
  );

  return yield* Fiber.join(worker);
});

// =============================================================================
// Nested Forks Example
// =============================================================================

/**
 * Demonstrates nested fiber hierarchies (parent -> child -> grandchild).
 */
export const nestedForksExample = Effect.gen(function* () {
  const parent = yield* forkWithTrace(
    Effect.gen(function* () {
      yield* withTrace(Effect.succeed("parent started"), "parent-init");

      // Parent forks a child
      const child = yield* forkWithTrace(
        Effect.gen(function* () {
          yield* withTrace(Effect.succeed("child started"), "child-init");

          // Child forks a grandchild
          const grandchild = yield* forkWithTrace(
            withTrace(
              sleepWithTrace("500 millis").pipe(Effect.as("grandchild done")),
              "grandchild-task",
            ),
            "grandchild",
          );

          yield* Fiber.join(grandchild);
          return "child done";
        }),
        "child",
      );

      yield* Fiber.join(child);
      return "parent done";
    }),
    "parent",
  );

  return yield* Fiber.join(parent);
});

// =============================================================================
// Racing Example
// =============================================================================

/**
 * Demonstrates racing with explicit fiber forking.
 * First fiber to complete wins, the loser gets interrupted.
 *
 * Uses forkWithTrace so both competing fibers are visible in the timeline.
 */
export const racingExample = Effect.gen(function* () {
  yield* withTrace(Effect.succeed("starting race"), "race-start");

  // Fork two fibers explicitly so we can visualize them
  const fastRunner = yield* forkWithTrace(
    sleepWithTrace("1 second").pipe(Effect.as("Fast runner wins!")),
    "fast-runner",
  );

  const slowRunner = yield* forkWithTrace(
    sleepWithTrace("2 seconds").pipe(Effect.as("Slow runner wins!")),
    "slow-runner",
  );

  // Race by joining both - Effect.race returns when first completes
  const winner = yield* withTrace(
    Effect.race(Fiber.join(fastRunner), Fiber.join(slowRunner)),
    "race-join",
  );

  // Interrupt both fibers (winner already done, loser gets interrupted)
  yield* Fiber.interrupt(fastRunner);
  yield* Fiber.interrupt(slowRunner);

  return winner;
});

// =============================================================================
// Failure Example (Phase 4: Errors)
// =============================================================================

/**
 * Demonstrates effects that fail and recovery.
 * - "setup" succeeds
 * - "risky-step" fails (so we see effect:end with result: "failure")
 * - "recovery" runs after catching the error
 *
 * Uses withTrace so every step (including the failing one) emits trace events.
 */
export const failureExample = Effect.gen(function* () {
  yield* withTrace(Effect.succeed("ready"), "setup");

  const recovered = yield* withTrace(
    Effect.fail(new Error("Something went wrong")),
    "risky-step",
  ).pipe(
    Effect.catchAll((err) =>
      Effect.succeed(`Recovered from: ${(err as Error).message}`),
    ),
  );

  yield* withTrace(
    Effect.sync(() => console.log("Recovery:", recovered)),
    "recovery",
  );

  return recovered;
});

// =============================================================================
// Retry Example (Phase 4: Errors & Retries)
// =============================================================================

/**
 * Demonstrates retryWithTrace: an effect that fails twice then succeeds.
 * A Ref counts attempts; the inner effect fails when count < 3.
 * retryWithTrace retries until success (or max retries).
 */
export const retryExample = Effect.gen(function* () {
  const attempts = yield* Ref.make(0);

  const flakyEffect = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1);
    if (n < 3) {
      return yield* Effect.fail(new Error(`Attempt ${n} failed`));
    }
    return "success";
  });

  return yield* retryWithTrace(flakyEffect, {
    maxRetries: 3,
    label: "flaky-task",
  });
});

// =============================================================================
// Basic Finalizers (Phase 5: Scopes & Resources)
// =============================================================================

/**
 * Demonstrates addFinalizerWithTrace: register 3 finalizers to show LIFO
 * order (last registered runs first). Log shows effect steps then
 * "Finalizer ran: finalizer-3", "finalizer-2", "finalizer-1".
 * Must run inside Effect.scoped so the finalizers have a scope to run in.
 */
export const basicFinalizersExample = Effect.scoped(
  Effect.gen(function* () {
    yield* addFinalizerWithTrace(() => Effect.sync(() => {}), "finalizer-1");
    yield* addFinalizerWithTrace(() => Effect.sync(() => {}), "finalizer-2");
    yield* addFinalizerWithTrace(() => Effect.sync(() => {}), "finalizer-3");
    yield* withTrace(Effect.succeed("step 1"), "step-1");
    yield* withTrace(Effect.succeed("step 2"), "step-2");
    return "done";
  }),
);

// =============================================================================
// Acquire / Release (Phase 5: Scopes & Resources)
// =============================================================================

/**
 * Demonstrates acquireReleaseWithTrace: acquire a resource, use it, then
 * release when the scope closes. Log shows "Resource acquired", steps,
 * then "Finalizer ran: connection:release".
 * Must run inside Effect.scoped so the release finalizer has a scope.
 */
export const acquireReleaseExample = Effect.scoped(
  Effect.gen(function* () {
    const connection = yield* acquireReleaseWithTrace(
      Effect.succeed({ id: "conn-1" }),
      () => Effect.sync(() => {}),
      "connection",
    );
    yield* withTrace(
      Effect.sync(() => console.log("Using", connection)),
      "use-connection",
    );
    return connection;
  }),
);

// =============================================================================
// Program Registry (with source code for display)
// =============================================================================

export const programs = {
  basic: {
    name: "Basic Example",
    description: "Sequential + concurrent execution with fiber joins",
    program: basicExample,
    source: `import { Effect, Fiber } from "effect";
import { forkWithTrace, withTrace, sleepWithTrace } from "./tracedRunner";

const program = Effect.gen(function* () {
  // Step 1: Sequential initialization
  yield* withTrace(
    Effect.sync(() => console.log("Initializing...")),
    "initialization"
  );

  // Step 2: Fork two concurrent workers
  const worker1 = yield* forkWithTrace(
    withTrace(
      sleepWithTrace("1 second").pipe(Effect.as("Worker 1 complete")),
      "worker-1-task"
    ),
    "worker-1"
  );

  const worker2 = yield* forkWithTrace(
    withTrace(
      sleepWithTrace("1.5 seconds").pipe(Effect.as("Worker 2 complete")),
      "worker-2-task"
    ),
    "worker-2"
  );

  // Step 3: Wait for both workers
  const result1 = yield* withTrace(Fiber.join(worker1), "join-worker-1");
  const result2 = yield* withTrace(Fiber.join(worker2), "join-worker-2");

  // Step 4: Final step
  yield* withTrace(
    Effect.sync(() => console.log("All workers done!")),
    "finalization"
  );

  return { result1, result2 };
});`,
  },
  multiStep: {
    name: "Multi-Step Worker",
    description: "A fiber performing multiple sequential steps",
    program: multiStepExample,
    source: `import { Effect, Fiber } from "effect";
import { forkWithTrace, withTrace, sleepWithTrace } from "./tracedRunner";

const program = Effect.gen(function* () {
  const worker = yield* forkWithTrace(
    Effect.gen(function* () {
      yield* withTrace(sleepWithTrace("500 millis"), "step-1-prepare");
      yield* withTrace(sleepWithTrace("500 millis"), "step-2-process");
      yield* withTrace(sleepWithTrace("500 millis"), "step-3-cleanup");
      return "Multi-step complete";
    }),
    "multi-step-worker"
  );

  return yield* Fiber.join(worker);
});`,
  },
  nestedForks: {
    name: "Nested Forks",
    description: "Parent -> child -> grandchild fiber hierarchy",
    program: nestedForksExample,
    source: `import { Effect, Fiber } from "effect";
import { forkWithTrace, withTrace, sleepWithTrace } from "./tracedRunner";

const program = Effect.gen(function* () {
  const parent = yield* forkWithTrace(
    Effect.gen(function* () {
      yield* withTrace(Effect.succeed("parent started"), "parent-init");

      // Parent forks a child
      const child = yield* forkWithTrace(
        Effect.gen(function* () {
          yield* withTrace(Effect.succeed("child started"), "child-init");

          // Child forks a grandchild
          const grandchild = yield* forkWithTrace(
            withTrace(
              sleepWithTrace("500 millis").pipe(Effect.as("grandchild done")),
              "grandchild-task"
            ),
            "grandchild"
          );

          yield* Fiber.join(grandchild);
          return "child done";
        }),
        "child"
      );

      yield* Fiber.join(child);
      return "parent done";
    }),
    "parent"
  );

  return yield* Fiber.join(parent);
});`,
  },
  racing: {
    name: "Racing",
    description:
      "Two fibers racing - first to complete wins, loser interrupted",
    program: racingExample,
    source: `import { Effect, Fiber } from "effect";
import { forkWithTrace, withTrace, sleepWithTrace } from "./tracedRunner";

const program = Effect.gen(function* () {
  yield* withTrace(Effect.succeed("starting race"), "race-start");

  // Fork two fibers explicitly so we can visualize them
  const fastRunner = yield* forkWithTrace(
    sleepWithTrace("1 second").pipe(Effect.as("Fast runner wins!")),
    "fast-runner"
  );

  const slowRunner = yield* forkWithTrace(
    sleepWithTrace("2 seconds").pipe(Effect.as("Slow runner wins!")),
    "slow-runner"
  );

  // Race by joining both - Effect.race returns when first completes
  const winner = yield* withTrace(
    Effect.race(Fiber.join(fastRunner), Fiber.join(slowRunner)),
    "race-join"
  );

  // Interrupt both fibers (winner already done, loser gets interrupted)
  yield* Fiber.interrupt(fastRunner);
  yield* Fiber.interrupt(slowRunner);

  return winner;
});`,
  },
  failureAndRecovery: {
    name: "Failure & Recovery",
    description: "A step fails, then we recover and continue",
    program: failureExample,
    source: `import { Effect } from "effect";
import { withTrace } from "./tracedRunner";

const program = Effect.gen(function* () {
  yield* withTrace(Effect.succeed("ready"), "setup");

  const recovered = yield* withTrace(
    Effect.fail(new Error("Something went wrong")),
    "risky-step"
  ).pipe(
    Effect.catchAll((err) =>
      Effect.succeed(\`Recovered from: \${(err as Error).message}\`)
    )
  );

  yield* withTrace(
    Effect.sync(() => console.log("Recovery:", recovered)),
    "recovery"
  );

  return recovered;
});`,
  },
  retry: {
    name: "Retry",
    description:
      "Effect fails twice then succeeds; retryWithTrace retries until success",
    program: retryExample,
    source: `import { Effect, Ref } from "effect";
import { retryWithTrace } from "./tracedRunner";

const program = Effect.gen(function* () {
  const attempts = yield* Ref.make(0);

  const flakyEffect = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1);
    if (n < 3) {
      return yield* Effect.fail(new Error(\`Attempt \${n} failed\`));
    }
    return "success";
  });

  return yield* retryWithTrace(flakyEffect, {
    maxRetries: 3,
    label: "flaky-task",
  });
});`,
  },
  basicFinalizers: {
    name: "Basic Finalizers",
    description:
      "Register 3 finalizers; they run in LIFO order when the scope closes",
    program: basicFinalizersExample,
    source: `import { Effect } from "effect";
import { addFinalizerWithTrace, withTrace } from "./tracedRunner";

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* addFinalizerWithTrace((_exit) => Effect.sync(() => {}), "finalizer-1");
    yield* addFinalizerWithTrace((_exit) => Effect.sync(() => {}), "finalizer-2");
    yield* addFinalizerWithTrace((_exit) => Effect.sync(() => {}), "finalizer-3");
    yield* withTrace(Effect.succeed("step 1"), "step-1");
    yield* withTrace(Effect.succeed("step 2"), "step-2");
    return "done";
  })
);`,
  },
  acquireRelease: {
    name: "Acquire / Release",
    description:
      "acquireReleaseWithTrace: acquire a resource, use it, release on scope exit",
    program: acquireReleaseExample,
    source: `import { Effect } from "effect";
import { acquireReleaseWithTrace, withTrace } from "./tracedRunner";

const program = Effect.scoped(
  Effect.gen(function* () {
    const connection = yield* acquireReleaseWithTrace(
      Effect.succeed({ id: "conn-1" }),
      () => Effect.sync(() => {}),
      "connection"
    );
    yield* withTrace(
      Effect.sync(() => console.log("Using", connection)),
      "use-connection"
    );
    return connection;
  })
);`,
  },
} as const;

export type ProgramKey = keyof typeof programs;
