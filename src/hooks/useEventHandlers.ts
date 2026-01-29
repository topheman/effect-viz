import { Effect } from "effect";

import { nestedForksExample } from "@/lib/programs";
import {
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

    // Wrap the example program with root fiber tracing
    const traced = runProgramWithTrace(nestedForksExample, "main");

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
