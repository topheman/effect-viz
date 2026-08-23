import { Effect, Fiber, Layer } from "effect";
import { useRef, useState } from "react";

import type { SpawnAndParseCallbacks } from "@/effects/spawnAndParse";
import { type ProgramKey, makeLoggerLayer, programs } from "@/lib/programs";
import { GatedScheduler } from "@/runtime/gatedScheduler";
import { runProgramFork } from "@/runtime/runProgram";
import { Stepper, type StepOutcome } from "@/runtime/stepper";
import { makeTraceEmitterLayer } from "@/runtime/tracedRunner";
import { VirtualClock } from "@/runtime/virtualClock";
import { makeVizClockLayer } from "@/runtime/vizClock";
import { makeVizLayers } from "@/runtime/vizSupervisor";
import { makeVizTracer } from "@/runtime/vizTracer";
import { useFiberStore } from "@/stores/fiberStore";
import { useTraceStore } from "@/stores/traceStore";
import { useWebContainerLogsStore } from "@/stores/webContainerLogsStore";
import type { TraceEvent } from "@/types/trace";

export interface WebContainerBridge {
  runPlay: ({
    callbacks,
    onFirstChunk,
    rate,
  }: {
    callbacks: SpawnAndParseCallbacks;
    onFirstChunk: () => void;
    rate: number;
  }) => Promise<{
    success: boolean;
    exitCode?: number;
  }>;
  interruptPlay: () => void;
  isReady: boolean;
}

export function useEventHandlers(webContainer?: WebContainerBridge | null) {
  const { addEvent, clear: clearEvents, setRate } = useTraceStore();
  const { processEvent, clear: clearFibers } = useFiberStore();
  const { addLog } = useWebContainerLogsStore();

  const [selectedProgram, setSelectedProgram] = useState<ProgramKey>("basic");
  const runningFiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(
    null,
  );
  const stepperRef = useRef<Stepper | null>(null);
  /**
   * Identifies the current run. Interrupting a program emits trace events of its
   * own, and they arrive after Reset has already cleared the stores, so events
   * from a run that is no longer current are dropped.
   */
  const runIdRef = useRef(0);
  /**
   * Only the in-browser path can be stepped. The WebContainer runs the program
   * in another process, which needs a control channel we do not have yet.
   */
  const [supportsStepping, setSupportsStepping] = useState(false);

  const handlePlay = ({
    onFirstChunk,
    rate,
  }: {
    onFirstChunk: () => void;
    /** Virtual ms per wall ms. Fixed for the run: see PlaybackControls. */
    rate: number;
  }) => {
    const runId = ++runIdRef.current;
    const isCurrentRun = () => runIdRef.current === runId;

    clearEvents();
    clearFibers();
    // The timeline's live cursor advances at this rate; see computeVirtualNow.
    setRate(rate);

    if (webContainer?.isReady) {
      setSupportsStepping(false);
      stepperRef.current = null;
      return webContainer
        .runPlay({
          callbacks: {
            addEvent: (event) => {
              if (isCurrentRun()) addEvent(event);
            },
            processEvent: (event) => {
              if (isCurrentRun()) processEvent(event);
            },
          },
          onFirstChunk,
          rate,
        })
        .then((result) => {
          if (!result.success) {
            console.error("Play failed:", result);
          }
          return result;
        });
    }

    return runFallbackPlay({ onFirstChunk, rate, isCurrentRun });
  };

  function runFallbackPlay({
    onFirstChunk,
    rate,
    isCurrentRun,
  }: {
    onFirstChunk: () => void;
    rate: number;
    isCurrentRun: () => boolean;
  }) {
    const { rootEffect, requirements } = programs[selectedProgram];
    const scoped = Effect.scoped(
      rootEffect as Effect.Effect<unknown, unknown, unknown>,
    );
    const onEmit = (event: TraceEvent) => {
      if (!isCurrentRun()) return;
      addEvent(event); // For ExecutionLog
      processEvent(event); // For FiberTreeView
      stepperRef.current?.noteEvent(); // A step runs until this moves
    };
    // Same virtual clock as the WebContainer path, so both record virtual
    // timestamps and slow down identically.
    const virtualClock = new VirtualClock({ rate });
    const scheduler = new GatedScheduler();
    const stepper = new Stepper({
      scheduler,
      clock: virtualClock,
      isFinished: () =>
        runningFiberRef.current !== null &&
        runningFiberRef.current.unsafePoll() !== null,
    });
    stepperRef.current = stepper;
    setSupportsStepping(true);
    const now = () => virtualClock.now();
    const traceLayer = makeTraceEmitterLayer(onEmit);
    const supervisorLayer = makeVizLayers(onEmit, now);
    // Fallback Logger layer: logs to panel (addLog) instead of console, so mobile users see output
    const fallbackLoggerLayer = makeLoggerLayer((msg) =>
      addLog("output", `[logger] ${msg}`),
    );
    const tracerLayer = Layer.setTracer(makeVizTracer(onEmit, now));
    const clockLayer = makeVizClockLayer(virtualClock);
    const allLayers = Layer.mergeAll(
      traceLayer,
      supervisorLayer,
      tracerLayer,
      clockLayer,
      ...requirements,
      fallbackLoggerLayer,
    );

    onFirstChunk(); // No compile step on mobile; program runs immediately
    const program = scoped.pipe(
      Effect.withScheduler(scheduler),
      Effect.provide(allLayers),
    ) as Effect.Effect<unknown, unknown, never>;
    const { fiber, promise } = runProgramFork(program, onEmit, now);
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
    runIdRef.current++;
    if (webContainer?.isReady) {
      webContainer.interruptPlay();
    } else if (runningFiberRef.current) {
      // Interruption reaches a fiber as a task, so a gated program cannot be
      // torn down: the scheduler has to be running first.
      stepperRef.current?.play();
      Effect.runPromise(Fiber.interrupt(runningFiberRef.current));
      runningFiberRef.current = null;
    }
    stepperRef.current?.reset();
    stepperRef.current = null;
    setSupportsStepping(false);
    clearEvents();
    clearFibers();
  };

  const handlePause = () => {
    stepperRef.current?.pause();
  };

  const handleResume = () => {
    stepperRef.current?.play();
  };

  const handleStep = (): StepOutcome | null =>
    stepperRef.current?.step() ?? null;

  return {
    handlePlay,
    handleReset,
    handlePause,
    handleResume,
    handleStep,
    supportsStepping,
    selectedProgram,
    setSelectedProgram,
    programs,
  };
}
