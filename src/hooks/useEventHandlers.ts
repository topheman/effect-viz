import { Effect, Fiber, Layer } from "effect";
import { useRef, useState } from "react";

import type {
  ControlSink,
  SpawnAndParseCallbacks,
} from "@/effects/spawnAndParse";
import { ContainerController } from "@/lib/containerController";
import { MirroredClock } from "@/lib/mirroredClock";
import { type ProgramKey, makeLoggerLayer, programs } from "@/lib/programs";
import { GatedScheduler } from "@/runtime/gatedScheduler";
import { runProgramFork } from "@/runtime/runProgram";
import { Stepper, type StepOutcome } from "@/runtime/stepper";
import { makeTraceEmitterLayer } from "@/runtime/tracedRunner";
import { makeOriginTagger } from "@/runtime/traceOrigin";
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
    startPaused,
    control,
  }: {
    callbacks: SpawnAndParseCallbacks;
    onFirstChunk: () => void;
    rate: number;
    startPaused?: boolean;
    control?: ControlSink;
  }) => Promise<{
    success: boolean;
    exitCode?: number;
  }>;
  interruptPlay: () => void;
  isReady: boolean;
}

export function useEventHandlers(webContainer?: WebContainerBridge | null) {
  const {
    addEvent,
    clear: clearEvents,
    setRate,
    setNowSource,
  } = useTraceStore();
  const { processEvent, clear: clearFibers } = useFiberStore();
  const { addLog } = useWebContainerLogsStore();

  const [selectedProgram, setSelectedProgram] = useState<ProgramKey>("basic");
  const runningFiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(
    null,
  );
  const stepperRef = useRef<Stepper | null>(null);
  /**
   * The container's half of the same three verbs. Outlives a single run — it is
   * attached when a process starts and detached when it exits.
   */
  const containerRef = useRef<ContainerController>(null);
  containerRef.current ??= new ContainerController();
  /** The page's model of the container's clock; null on the in-browser path, which reads the real one. */
  const mirrorRef = useRef<MirroredClock | null>(null);
  /**
   * Identifies the current run. Interrupting a program emits trace events of its
   * own, and they arrive after Reset has already cleared the stores, so events
   * from a run that is no longer current are dropped.
   */
  const runIdRef = useRef(0);
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
      const controller = containerRef.current;
      // The real clock is in the other process, so the timeline follows a model
      // of it, corrected by every virtual reading that comes back.
      const mirror = new MirroredClock(rate);
      mirrorRef.current = mirror;
      setNowSource(() => mirror.now());
      if (startPaused) mirror.pause();

      const control: ControlSink = {
        attach: (send) => controller?.attach(send),
        handleReply: (reply) => {
          mirror.sync(reply.virtualNow);
          // Resuming is driven by the reply rather than by the click: the
          // container keeps running for the length of a round trip either way,
          // and a model resumed early would run ahead of it for good, since
          // corrections only move the cursor forward.
          if (reply.reply === "resume") mirror.resume();
          controller?.handleReply(reply);
        },
        detach: () => controller?.detach(),
      };

      return webContainer
        .runPlay({
          callbacks: {
            addEvent: (event) => {
              if (!isCurrentRun()) return;
              // Every event timestamp is a virtual reading taken in the
              // container, so the model is corrected continuously while a
              // program runs, not only when a command is sent.
              if (typeof event.timestamp === "number") {
                mirror.sync(event.timestamp);
              }
              addEvent(event);
            },
            processEvent: (event) => {
              if (isCurrentRun()) processEvent(event);
            },
          },
          onFirstChunk,
          rate,
          startPaused,
          control,
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
    // A paused start injects a yield the program never wrote; the tagger marks
    // the suspend and resume it produces so the log can offer to hide them.
    const tagOrigin = makeOriginTagger({ startPaused });
    const onEmit = (event: TraceEvent) => {
      if (!isCurrentRun()) return;
      const tagged = tagOrigin(event);
      addEvent(tagged); // For ExecutionLog
      processEvent(tagged); // For FiberTreeView
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
    // The timeline follows this clock directly, so it freezes when the stepper
    // does and jumps when a step moves virtual time.
    setNowSource(() => virtualClock.now());
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
      mirrorRef.current = null;
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

  /**
   * Pause, resume and step reach the runtime directly in the browser and as
   * messages in the container, so a step is a promise on both paths: one that is
   * already settled, and one that waits for a round trip.
   */
  const handlePause = () => {
    if (webContainer?.isReady) {
      // Frozen on the click rather than on the reply, so the cursor stops when
      // the user expects. The container runs on for a round trip, and the
      // reply's reading corrects the cursor forward to meet it.
      mirrorRef.current?.pause();
      containerRef.current?.pause();
      return;
    }
    stepperRef.current?.pause();
  };

  const handleResume = () => {
    if (webContainer?.isReady) {
      containerRef.current?.play();
      return;
    }
    stepperRef.current?.play();
  };

  const handleStep = async (): Promise<StepOutcome | null> => {
    if (webContainer?.isReady) {
      return (await containerRef.current?.step()) ?? null;
    }
    return stepperRef.current?.step() ?? null;
  };

  return {
    handlePlay,
    handleReset,
    handlePause,
    handleResume,
    handleStep,
    selectedProgram,
    setSelectedProgram,
    programs,
  };
}
