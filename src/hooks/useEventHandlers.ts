import { Effect, Fiber } from "effect";
import { useRef, useState } from "react";

import type { SpawnAndParseCallbacks } from "@/effects/spawnAndParse";
import { type ProgramKey, programs } from "@/lib/programs";
import {
  makeTraceEmitterLayer,
  runProgramWithTrace,
} from "@/runtime/tracedRunner";
import { TraceEmitter } from "@/runtime/traceEmitter";
import { useFiberStore } from "@/stores/fiberStore";
import { useTraceStore } from "@/stores/traceStore";

export interface WebContainerBridge {
  runPlay: ({
    callbacks,
    onFirstChunk,
  }: {
    callbacks: SpawnAndParseCallbacks;
    onFirstChunk: () => void;
  }) => Promise<{
    success: boolean;
    exitCode?: number;
  }>;
  interruptPlay: () => void;
  isReady: boolean;
}

export function useEventHandlers(webContainer?: WebContainerBridge | null) {
  const { addEvent, clear: clearEvents } = useTraceStore();
  const { processEvent, clear: clearFibers } = useFiberStore();

  const [selectedProgram, setSelectedProgram] = useState<ProgramKey>("basic");
  const runningFiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(
    null,
  );

  const handlePlay = ({ onFirstChunk }: { onFirstChunk: () => void }) => {
    clearEvents();
    clearFibers();

    if (webContainer?.isReady) {
      return webContainer
        .runPlay({
          callbacks: {
            addEvent,
            processEvent,
          },
          onFirstChunk,
        })
        .then((result) => {
          if (!result.success) {
            console.error("Play failed:", result);
          }
          return result;
        });
    }

    return runFallbackPlay();
  };

  function runFallbackPlay() {
    const program = programs[selectedProgram].program as Effect.Effect<
      unknown,
      unknown,
      TraceEmitter
    >;
    const traced = runProgramWithTrace(program, selectedProgram);
    const layer = makeTraceEmitterLayer((event) => {
      addEvent(event); // For ExecutionLog
      processEvent(event); // For FiberTreeView
    });

    const fiber = Effect.runFork(traced.pipe(Effect.provide(layer)));
    runningFiberRef.current = fiber;

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
  }

  const handleReset = () => {
    if (webContainer?.isReady) {
      webContainer.interruptPlay();
    } else if (runningFiberRef.current) {
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
