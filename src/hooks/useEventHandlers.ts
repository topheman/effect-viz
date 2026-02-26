import { Effect, Fiber, Layer } from "effect";
import { useRef, useState } from "react";

import type { SpawnAndParseCallbacks } from "@/effects/spawnAndParse";
import { type ProgramKey, makeLoggerLayer, programs } from "@/lib/programs";
import {
  makeTraceEmitterLayer,
  makeVizLayers,
  runProgramFork,
} from "@/runtime";
import { useFiberStore } from "@/stores/fiberStore";
import { useTraceStore } from "@/stores/traceStore";
import { useWebContainerLogsStore } from "@/stores/webContainerLogsStore";
import type { TraceEvent } from "@/types/trace";

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
  const { addLog } = useWebContainerLogsStore();

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

    return runFallbackPlay({ onFirstChunk });
  };

  function runFallbackPlay({ onFirstChunk }: { onFirstChunk: () => void }) {
    const { rootEffect, requirements } = programs[selectedProgram];
    const scoped = Effect.scoped(
      rootEffect as Effect.Effect<unknown, unknown, unknown>,
    );
    const onEmit = (event: TraceEvent) => {
      addEvent(event); // For ExecutionLog
      processEvent(event); // For FiberTreeView
    };
    const traceLayer = makeTraceEmitterLayer(onEmit);
    const supervisorLayer = makeVizLayers(onEmit);
    // Fallback Logger layer: logs to panel (addLog) instead of console, so mobile users see output
    const fallbackLoggerLayer = makeLoggerLayer((msg) =>
      addLog("output", `[logger] ${msg}`),
    );
    const allLayers = Layer.mergeAll(
      traceLayer,
      supervisorLayer,
      ...requirements,
      fallbackLoggerLayer,
    );

    onFirstChunk(); // No compile step on mobile; program runs immediately
    const program = scoped.pipe(Effect.provide(allLayers)) as Effect.Effect<
      unknown,
      unknown,
      never
    >;
    const { fiber, promise } = runProgramFork(program, onEmit);
    runningFiberRef.current = fiber;

    return promise.then(
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
