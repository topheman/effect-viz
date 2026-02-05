import { Effect, Fiber } from "effect";
import { useRef, useState } from "react";

import { type ProgramKey, programs } from "@/lib/programs";
import {
  makeTraceEmitterLayer,
  runProgramWithTrace,
} from "@/runtime/tracedRunner";
import { TraceEmitter } from "@/runtime/traceEmitter";
import { useFiberStore } from "@/stores/fiberStore";
import { useTraceStore } from "@/stores/traceStore";

export function useEventHandlers() {
  const { addEvent, clear: clearEvents } = useTraceStore();
  const { processEvent, clear: clearFibers } = useFiberStore();

  // Currently selected program
  const [selectedProgram, setSelectedProgram] = useState<ProgramKey>("basic");

  // Track the running fiber so we can interrupt it
  const runningFiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(
    null,
  );

  const handlePlay = () => {
    // Reset previous state
    clearEvents();
    clearFibers();

    // Get the selected program (cast to generic effect; programs have varying A/E)
    const program = programs[selectedProgram].program as Effect.Effect<
      unknown,
      unknown,
      TraceEmitter
    >;

    const traced = runProgramWithTrace(program, selectedProgram);

    // Create layer that emits to BOTH stores
    const layer = makeTraceEmitterLayer((event) => {
      addEvent(event); // For ExecutionLog
      processEvent(event); // For FiberTreeView
    });

    // Run the program using runFork to get a fiber handle
    const fiber = Effect.runFork(traced.pipe(Effect.provide(layer)));
    runningFiberRef.current = fiber;

    // Log when complete
    return Effect.runPromise(Fiber.join(fiber)).then(
      (result) => {
        console.log("Program completed:", result);
        runningFiberRef.current = null;
        return { success: true };
      },
      (error) => {
        console.error("Program failed:", error);
        runningFiberRef.current = null;
        return { success: false, error };
      },
    );
  };

  const handleReset = () => {
    if (runningFiberRef.current) {
      Effect.runPromise(Fiber.interrupt(runningFiberRef.current));
      runningFiberRef.current = null;
    }
    clearEvents();
    clearFibers();
  };

  return {
    handlePlay,
    handleReset,
    selectedProgram,
    setSelectedProgram,
    programs,
  };
}
