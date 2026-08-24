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
   * Only the in-browser path can be stepped: the WebContainer runs the program
   * in another process, which needs a control channel we do not have yet.
   *
   * Derived rather than set when a run starts, because Step can *begin* a run —
   * the button has to know before there is anything to step.
   */
  const supportsStepping = !webContainer?.isReady;

  const handlePlay = ({
    onFirstChunk,
    rate,
    startPaused = false,
  }: {
    onFirstChunk: () => void;
    /** Virtual ms per wall ms. Fixed for the run: see PlaybackControls. */
    rate: number;
    /** Gate the scheduler before the program runs, so its first step is yours. */
    startPaused?: boolean;
  }) => {
    const runId = ++runIdRef.current;
    const isCurrentRun = () => runIdRef.current === runId;

    clearEvents();
    clearFibers();
    // The timeline's live cursor advances at this rate; see computeVirtualNow.
    setRate(rate);

    if (webContainer?.isReady) {
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

    return runFallbackPlay({ onFirstChunk, rate, isCurrentRun, startPaused });
  };

  function runFallbackPlay({
    onFirstChunk,
    rate,
    isCurrentRun,
    startPaused,
  }: {
    onFirstChunk: () => void;
    rate: number;
    isCurrentRun: () => boolean;
    startPaused: boolean;
  }) {
    const { rootEffect, requirements } = programs[selectedProgram];
    // `Effect.runFork` runs a fiber synchronously until its first yield, and the
    // scheduler only governs resumption. Yielding first therefore hands the very
    // first operation to the gate, so a paused start can be stepped from event
    // one instead of after the opening burst.
    const body = startPaused
      ? Effect.zipRight(
          Effect.yieldNow(),
          rootEffect as Effect.Effect<unknown, unknown, unknown>,
        )
      : (rootEffect as Effect.Effect<unknown, unknown, unknown>);
    const scoped = Effect.scoped(body);
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
    // Gate before the program is forked, so even its first task is held.
    if (startPaused) stepper.pause();
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
