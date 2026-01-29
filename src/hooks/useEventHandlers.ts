import { Effect, Fiber } from "effect";

import {
  forkWithTrace,
  makeTraceEmitterLayer,
  runProgramWithTrace,
} from "@/runtime/tracedRunner";
import { useFiberStore } from "@/stores/fiberStore";
import { useTraceStore } from "@/stores/traceStore";

export function useEventHandlers() {
  const { addEvent, clear: clearEvents } = useTraceStore();
  const { processEvent, clear: clearFibers } = useFiberStore();

  const handlePlay = () => {
    // Reset previous state
    clearEvents();
    clearFibers();

    // Create the test program with forked fibers
    const testProgram = Effect.gen(function* () {
      // Fork two concurrent tasks
      const fiber1 = yield* forkWithTrace(
        Effect.sleep("1 second").pipe(Effect.as("task-1 done")),
        "task-1",
      );
      const fiber2 = yield* forkWithTrace(
        Effect.sleep("2 seconds").pipe(Effect.as("task-2 done")),
        "task-2",
      );

      // Wait for both to complete
      const result1 = yield* Fiber.join(fiber1);
      const result2 = yield* Fiber.join(fiber2);

      return { result1, result2 };
    });

    // Wrap with root fiber tracing
    const traced = runProgramWithTrace(testProgram, "main-program");

    // Create layer that emits to BOTH stores
    const layer = makeTraceEmitterLayer((event) => {
      addEvent(event); // For ExecutionLog
      processEvent(event); // For FiberTreeView
    });

    // Run the program
    Effect.runPromise(traced.pipe(Effect.provide(layer))).then(
      (result) => console.log("Program completed:", result),
      (error) => console.error("Program failed:", error),
    );
  };

  return { handlePlay };
}
