/**
 * Example programs for the EffectViz visualizer.
 * These demonstrate different Effect patterns with tracing.
 */

import { Context, Effect, Fiber, Layer, Ref, Schedule } from "effect";

import { addFinalizer, acquireRelease, retry } from "@/runtime";

// =============================================================================
// Basic Example: Sequential + Concurrent Execution
// =============================================================================

/**
 * A basic example that demonstrates:
 * - Sequential effect execution with Effect.withSpan
 * - Concurrent fiber execution with Effect.fork
 * - Fiber joining (waiting for completion)
 */
export const basicExample = Effect.gen(function* () {
  // Step 1: Sequential initialization
  yield* Effect.withSpan("initialization")(
    Effect.sync(() => console.log("Initializing...")),
  );

  // Step 2: Fork two concurrent workers
  const worker1 = yield* Effect.fork(
    Effect.withSpan("worker-1-task")(
      Effect.sleep("1 second").pipe(Effect.as("Worker 1 complete")),
    ),
  );

  const worker2 = yield* Effect.fork(
    Effect.withSpan("worker-2-task")(
      Effect.sleep("1.5 seconds").pipe(Effect.as("Worker 2 complete")),
    ),
  );

  // Step 3: Wait for both workers
  const result1 = yield* Effect.withSpan("join-worker-1")(Fiber.join(worker1));
  const result2 = yield* Effect.withSpan("join-worker-2")(Fiber.join(worker2));

  // Step 4: Final step
  yield* Effect.withSpan("finalization")(
    Effect.sync(() => console.log("All workers done!")),
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
  const worker = yield* Effect.fork(
    Effect.gen(function* () {
      yield* Effect.withSpan("step-1-prepare")(Effect.sleep("500 millis"));
      yield* Effect.withSpan("step-2-process")(Effect.sleep("500 millis"));
      yield* Effect.withSpan("step-3-cleanup")(Effect.sleep("500 millis"));
      return "Multi-step complete";
    }),
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
  const parent = yield* Effect.fork(
    Effect.gen(function* () {
      yield* Effect.withSpan("parent-init")(Effect.succeed("parent started"));

      // Parent forks a child
      const child = yield* Effect.fork(
        Effect.gen(function* () {
          yield* Effect.withSpan("child-init")(Effect.succeed("child started"));

          // Child forks a grandchild
          const grandchild = yield* Effect.fork(
            Effect.withSpan("grandchild-task")(
              Effect.sleep("500 millis").pipe(Effect.as("grandchild done")),
            ),
          );

          yield* Fiber.join(grandchild);
          return "child done";
        }),
      );

      yield* Fiber.join(child);
      return "parent done";
    }),
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
 * Uses Effect.fork so both competing fibers are visible in the timeline.
 */
export const racingExample = Effect.gen(function* () {
  yield* Effect.withSpan("race-start")(Effect.succeed("starting race"));

  // Fork two fibers explicitly so we can visualize them
  const fastRunner = yield* Effect.fork(
    Effect.sleep("1 second").pipe(Effect.as("Fast runner wins!")),
  );

  const slowRunner = yield* Effect.fork(
    Effect.sleep("2 seconds").pipe(Effect.as("Slow runner wins!")),
  );

  // Race by joining both - Effect.race returns when first completes
  const winner = yield* Effect.withSpan("race-join")(
    Effect.race(Fiber.join(fastRunner), Fiber.join(slowRunner)),
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
 * Uses Effect.withSpan so every step (including the failing one) emits trace events.
 */
export const failureExample = Effect.gen(function* () {
  // Step 1: Setup succeeds
  yield* Effect.withSpan("setup")(Effect.succeed("ready"));

  // Step 2: Risky step fails; catchAll recovers with a message
  const recovered = yield* Effect.withSpan("risky-step")(
    Effect.fail(new Error("Something went wrong")),
  ).pipe(
    Effect.catchAll((err) =>
      Effect.succeed(`Recovered from: ${(err as Error).message}`),
    ),
  );

  // Step 3: Log recovery and return
  yield* Effect.withSpan("recovery")(
    Effect.sync(() => console.log("Recovery:", recovered)),
  );

  return recovered;
});

// =============================================================================
// Retry Example (Phase 4: Errors & Retries)
// =============================================================================

/**
 * Demonstrates retry: an effect that fails twice then succeeds.
 * A Ref counts attempts; the inner effect fails when count < 3.
 * retry retries until success (or max retries).
 */
export const retryExample = Effect.gen(function* () {
  // Step 1: Ref to count attempts
  const attempts = yield* Ref.make(0);

  // Step 2: Effect that fails when count < 3, then succeeds
  const flakyEffect = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1);
    if (n < 3) {
      return yield* Effect.fail(new Error(`Attempt ${n} failed`));
    }
    return "success";
  });

  // Step 3: retry retries until success (Schedule.recurs(3) = 3 retries)
  return yield* retry(flakyEffect, Schedule.recurs(3), "flaky-task");
});

// =============================================================================
// Retry with Exponential Backoff
// =============================================================================

/**
 * Demonstrates retry with exponential backoff.
 * Same structure as retryExample but Schedule.addDelay adds 100ms, 200ms, 400ms between attempts.
 * Timeline shows fiber:suspend during the delays.
 */
export const retryExponentialBackoffExample = Effect.gen(function* () {
  // Step 1: Ref to count attempts
  const attempts = yield* Ref.make(0);

  // Step 2: Effect that fails when count < 3, then succeeds
  const flakyEffect = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1);
    if (n < 5) {
      return yield* Effect.fail(new Error(`Attempt ${n} failed`));
    }
    return "success";
  });

  // Step 3: retry with exponential backoff (100ms, 200ms, 400ms, ... between attempts)
  const schedule = Schedule.addDelay(
    Schedule.recurs(5),
    (n) => `${100 * 2 ** n} millis`,
  );
  return yield* retry(flakyEffect, schedule, "flaky-task");
});

// =============================================================================
// Basic Finalizers (Phase 5: Scopes & Resources)
// =============================================================================

/**
 * Demonstrates addFinalizer: register 3 finalizers to show LIFO
 * order (last registered runs first). Log shows effect steps then
 * "Finalizer ran: finalizer-3", "finalizer-2", "finalizer-1".
 * Must run inside Effect.scoped so the finalizers have a scope to run in.
 */
export const basicFinalizersExample = Effect.scoped(
  Effect.gen(function* () {
    // Step 1: Register 3 finalizers (LIFO: 3 runs first, then 2, then 1)
    yield* addFinalizer(() => Effect.sync(() => {}), "finalizer-1");
    yield* addFinalizer(() => Effect.sync(() => {}), "finalizer-2");
    yield* addFinalizer(() => Effect.sync(() => {}), "finalizer-3");
    // Step 2: Run two traced steps
    yield* Effect.withSpan("step-1")(Effect.succeed("step 1"));
    yield* Effect.withSpan("step-2")(Effect.succeed("step 2"));
    // Step 3: Return; scope exit runs finalizers
    return "done";
  }),
);

// =============================================================================
// Acquire / Release (Phase 5: Scopes & Resources)
// =============================================================================

/**
 * Demonstrates acquireRelease: acquire a resource, use it, then
 * release when the scope closes. Log shows "Resource acquired", steps,
 * then "Finalizer ran: connection:release".
 * Must run inside Effect.scoped so the release finalizer has a scope.
 */
export const acquireReleaseExample = Effect.scoped(
  Effect.gen(function* () {
    // Step 1: Acquire resource (release runs when scope closes)
    const connection = yield* acquireRelease(
      Effect.succeed({ id: "conn-1" }),
      () => Effect.sync(() => {}),
      "connection",
    );
    // Step 2: Use the connection
    yield* Effect.withSpan("use-connection")(
      Effect.sync(() => console.log("Using", connection)),
    );
    // Step 3: Return; release finalizer runs on scope exit
    return connection;
  }),
);

// =============================================================================
// Custom Requirements Example (Logger service)
// =============================================================================

interface Logger {
  readonly log: (message: string) => Effect.Effect<void>;
}

const Logger = Context.GenericTag<Logger>("app/Logger");

/**
 * Create a Logger layer. Export for fallback mode
 * (in order to log directly to panel instead of console).
 */
export const makeLoggerLayer = (
  onLog: (message: string) => void,
): Layer.Layer<Logger> =>
  Layer.succeed(Logger, {
    log: (msg) => Effect.sync(() => onLog(msg)),
  });

const loggerLayer = makeLoggerLayer((msg) => console.log("[logger]", msg));

/**
 * Demonstrates requirements: rootEffect depends on a custom Logger service.
 * The runner injects TraceEmitter; we provide Logger via requirements.
 */
export const loggerWithRequirementsExample = Effect.gen(function* () {
  const logger = yield* Logger;
  yield* Effect.withSpan("log-message")(
    logger.log("Hello from custom Logger service!"),
  );
  return "Logged via requirements";
});

// =============================================================================
// Program Registry (with source code for display)
// =============================================================================

/**
 * Contract for visualizable programs.
 * Programs export rootEffect (the effect to run) and requirements (layers to provide).
 * TraceEmitter is injected by the runner; do not include it in requirements.
 */
export interface VisualizableProgramContract {
  readonly rootEffect: Effect.Effect<unknown, unknown, unknown>;
  readonly requirements: ReadonlyArray<Layer.Layer<unknown>>;
}

export const programs = {
  basic: {
    name: "Basic Example",
    description: "Sequential + concurrent execution with fiber joins",
    rootEffect: basicExample,
    requirements: [] as const,
    source: `import { Effect, Fiber } from "effect";

export const rootEffect = Effect.gen(function* () {
  // Step 1: Sequential initialization
  yield* Effect.withSpan("initialization")(
    Effect.sync(() => console.log("Initializing..."))
  );

  // Step 2: Fork two concurrent workers
  const worker1 = yield* Effect.fork(
    Effect.withSpan("worker-1-task")(
      Effect.sleep("1 second").pipe(Effect.as("Worker 1 complete"))
    )
  );

  const worker2 = yield* Effect.fork(
    Effect.withSpan("worker-2-task")(
      Effect.sleep("1.5 seconds").pipe(Effect.as("Worker 2 complete"))
    )
  );

  // Step 3: Wait for both workers
  const result1 = yield* Effect.withSpan("join-worker-1")(Fiber.join(worker1));
  const result2 = yield* Effect.withSpan("join-worker-2")(Fiber.join(worker2));

  // Step 4: Final step
  yield* Effect.withSpan("finalization")(
    Effect.sync(() => console.log("All workers done!"))
  );

  return { result1, result2 };
});

export const requirements = [];
`,
  },
  multiStep: {
    name: "Multi-Step Worker",
    description: "A fiber performing multiple sequential steps",
    rootEffect: multiStepExample,
    requirements: [] as const,
    source: `import { Effect, Fiber } from "effect";

export const rootEffect = Effect.gen(function* () {
  const worker = yield* Effect.fork(
    Effect.gen(function* () {
      yield* Effect.withSpan("step-1-prepare")(Effect.sleep("500 millis"));
      yield* Effect.withSpan("step-2-process")(Effect.sleep("500 millis"));
      yield* Effect.withSpan("step-3-cleanup")(Effect.sleep("500 millis"));
      return "Multi-step complete";
    })
  );

  return yield* Fiber.join(worker);
});

export const requirements = [];`,
  },
  nestedForks: {
    name: "Nested Forks",
    description: "Parent -> child -> grandchild fiber hierarchy",
    rootEffect: nestedForksExample,
    requirements: [] as const,
    source: `import { Effect, Fiber } from "effect";

export const rootEffect = Effect.gen(function* () {
  const parent = yield* Effect.fork(
    Effect.gen(function* () {
      yield* Effect.withSpan("parent-init")(Effect.succeed("parent started"));

      // Parent forks a child
      const child = yield* Effect.fork(
        Effect.gen(function* () {
          yield* Effect.withSpan("child-init")(Effect.succeed("child started"));

          // Child forks a grandchild
          const grandchild = yield* Effect.fork(
            Effect.withSpan("grandchild-task")(
              Effect.sleep("500 millis").pipe(Effect.as("grandchild done"))
            )
          );

          yield* Fiber.join(grandchild);
          return "child done";
        })
      );

      yield* Fiber.join(child);
      return "parent done";
    })
  );

  return yield* Fiber.join(parent);
});

export const requirements = [];
`,
  },
  racing: {
    name: "Racing",
    description:
      "Two fibers racing - first to complete wins, loser interrupted",
    rootEffect: racingExample,
    requirements: [] as const,
    source: `import { Effect, Fiber } from "effect";

export const rootEffect = Effect.gen(function* () {
  yield* Effect.withSpan("race-start")(Effect.succeed("starting race"));

  // Fork two fibers explicitly so we can visualize them
  const fastRunner = yield* Effect.fork(
    Effect.sleep("1 second").pipe(Effect.as("Fast runner wins!"))
  );

  const slowRunner = yield* Effect.fork(
    Effect.sleep("2 seconds").pipe(Effect.as("Slow runner wins!"))
  );

  // Race by joining both - Effect.race returns when first completes
  const winner = yield* Effect.withSpan("race-join")(
    Effect.race(Fiber.join(fastRunner), Fiber.join(slowRunner))
  );

  // Interrupt both fibers (winner already done, loser gets interrupted)
  yield* Fiber.interrupt(fastRunner);
  yield* Fiber.interrupt(slowRunner);

  return winner;
});

export const requirements = [];
`,
  },
  failureAndRecovery: {
    name: "Failure & Recovery",
    description: "A step fails, then we recover and continue",
    rootEffect: failureExample,
    requirements: [] as const,
    source: `import { Effect } from "effect";

export const rootEffect = Effect.gen(function* () {
  // Step 1: Setup succeeds
  yield* Effect.withSpan("setup")(Effect.succeed("ready"));

  // Step 2: Risky step fails; catchAll recovers with a message
  const recovered = yield* Effect.withSpan("risky-step")(
    Effect.fail(new Error("Something went wrong"))
  ).pipe(
    Effect.catchAll((err) =>
      Effect.succeed(\`Recovered from: \${(err as Error).message}\`)
    )
  );

  // Step 3: Log recovery and return
  yield* Effect.withSpan("recovery")(
    Effect.sync(() => console.log("Recovery:", recovered))
  );

  return recovered;
});

export const requirements = [];
`,
  },
  retry: {
    name: "Retry",
    description:
      "Effect fails twice then succeeds; retry retries until success",
    rootEffect: retryExample,
    requirements: [] as const,
    source: `import { Effect, Ref, Schedule } from "effect";
// Use @/runtime (not Effect.retry) so the visualizer can trace retries
import { retry } from "@/runtime";

export const rootEffect = Effect.gen(function* () {
  // Step 1: Ref to count attempts
  const attempts = yield* Ref.make(0);

  // Step 2: Effect that fails when count < 3, then succeeds
  const flakyEffect = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1);
    if (n < 3) {
      return yield* Effect.fail(new Error(\`Attempt \${n} failed\`));
    }
    return "success";
  });

  // Step 3: retry retries until success (Schedule.recurs(3) = 3 retries)
  return yield* retry(flakyEffect, Schedule.recurs(3), "flaky-task");
});

export const requirements = [];
`,
  },
  retryExponentialBackoff: {
    name: "Retry (Exponential Backoff)",
    description:
      "Same as Retry but with exponential backoff: 100ms, 200ms, 400ms, ... between attempts",
    rootEffect: retryExponentialBackoffExample,
    requirements: [] as const,
    source: `import { Effect, Ref, Schedule } from "effect";
// Use @/runtime (not Effect.retry) so the visualizer can trace retries
import { retry } from "@/runtime";

export const rootEffect = Effect.gen(function* () {
  // Step 1: Ref to count attempts
  const attempts = yield* Ref.make(0);

  // Step 2: Effect that fails when count < 3, then succeeds
  const flakyEffect = Effect.gen(function* () {
    const n = yield* Ref.updateAndGet(attempts, (x) => x + 1);
    if (n < 5) {
      return yield* Effect.fail(new Error(\`Attempt \${n} failed\`));
    }
    return "success";
  });

  // Step 3: retry with exponential backoff (100ms, 200ms, 400ms, ... between attempts)
  const schedule = Schedule.addDelay(
    Schedule.recurs(5),
    (n) => \`\${100 * 2 ** n} millis\`,
  );
  return yield* retry(flakyEffect, schedule, "flaky-task");
});

export const requirements = [];
`,
  },
  basicFinalizers: {
    name: "Basic Finalizers",
    description:
      "Register 3 finalizers; they run in LIFO order when the scope closes",
    rootEffect: basicFinalizersExample,
    requirements: [] as const,
    source: `import { Effect } from "effect";
// Use @/runtime (not Effect.addFinalizer) so the visualizer can trace finalizers
import { addFinalizer } from "@/runtime";

export const rootEffect = Effect.scoped(
  Effect.gen(function* () {
    // Step 1: Register 3 finalizers (LIFO: 3 runs first, then 2, then 1)
    yield* addFinalizer(() => Effect.sync(() => {}), "finalizer-1");
    yield* addFinalizer(() => Effect.sync(() => {}), "finalizer-2");
    yield* addFinalizer(() => Effect.sync(() => {}), "finalizer-3");
    // Step 2: Run two traced steps
    yield* Effect.withSpan("step-1")(Effect.succeed("step 1"));
    yield* Effect.withSpan("step-2")(Effect.succeed("step 2"));
    // Step 3: Return; scope exit runs finalizers
    return "done";
  })
);

export const requirements = [];
`,
  },
  acquireRelease: {
    name: "Acquire / Release",
    description:
      "acquireRelease: acquire a resource, use it, release on scope exit",
    rootEffect: acquireReleaseExample,
    requirements: [] as const,
    source: `import { Effect } from "effect";
// Use @/runtime (not Effect.acquireRelease) so the visualizer can trace acquire/release
import { acquireRelease } from "@/runtime";

export const rootEffect = Effect.scoped(
  Effect.gen(function* () {
    // Step 1: Acquire resource (release runs when scope closes)
    const connection = yield* acquireRelease(
      Effect.succeed({ id: "conn-1" }),
      () => Effect.sync(() => {}),
      "connection"
    );
    // Step 2: Use the connection
    yield* Effect.withSpan("use-connection")(
      Effect.sync(() => console.log("Using", connection))
    );
    // Step 3: Return; release finalizer runs on scope exit
    return connection;
  })
);

export const requirements = [];
`,
  },
  loggerWithRequirements: {
    name: "Logger (custom requirements)",
    description: "Uses a custom Logger service provided via requirements array",
    rootEffect: loggerWithRequirementsExample,
    requirements: [loggerLayer] as const,
    source: `import { Effect, Context, Layer } from "effect";

interface Logger {
  readonly log: (message: string) => Effect.Effect<void>;
}

const Logger = Context.GenericTag<Logger>("app/Logger");

const makeLoggerLayer = (onLog: (msg: string) => void): Layer.Layer<Logger> =>
  Layer.succeed(Logger, {
    log: (msg) => Effect.sync(() => onLog(msg)),
  });

const loggerLayer = makeLoggerLayer((msg) => console.log("[logger]", msg));

export const rootEffect = Effect.gen(function* () {
  const logger = yield* Logger;
  yield* Effect.withSpan("log-message")(
    logger.log("Hello from custom Logger service!")
  );
  return "Logged via requirements";
});

export const requirements = [loggerLayer];
`,
  },
} as const;

export type ProgramKey = keyof typeof programs;
