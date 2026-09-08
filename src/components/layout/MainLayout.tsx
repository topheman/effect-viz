import { GripHorizontal, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MultiModelEditor } from "@/components/editor/MultiModelEditor";
import { WebContainerLogsPanel } from "@/components/editor/WebContainerLogsPanel";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Select } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VisualizerPanel } from "@/components/visualizer/VisualizerPanel";
import { useEventHandlers } from "@/hooks/useEventHandlers";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useOnboarding } from "@/hooks/useOnboarding";
import { type Speed, useSpeed } from "@/hooks/useSpeed";
import { useWebContainerBoot } from "@/hooks/useWebContainerBoot";
import { useCanSupportWebContainer } from "@/lib/mobileDetection";
import {
  getPlaybackAvailability,
  type PauseReason,
  type PlaybackState,
} from "@/lib/playbackAvailability";
import {
  computeProgramSwitch,
  computeResetToTemplate,
} from "@/lib/programCache";
import type { ProgramKey } from "@/lib/programs";
import { cn } from "@/lib/utils";

import { Header } from "./Header";
import { PlaybackControls } from "./PlaybackControls";

/**
 * How long a speed change waits before it starts the program, so that walking
 * the select with the keyboard settles on one run rather than one per option.
 */
const SPEED_AUTO_START_DELAY_MS = 250;

export function MainLayout() {
  const canSupportWebContainer = useCanSupportWebContainer();
  const webContainer = useWebContainerBoot();
  const webContainerBridge = webContainer.isReady
    ? {
        runPlay: webContainer.runPlay,
        interruptPlay: webContainer.interruptPlay,
        isReady: true,
      }
    : null;

  const {
    handlePlay,
    handlePause,
    handleResume,
    handleStep,
    handleSetRate,
    handleReset,
    selectedProgram,
    setSelectedProgram,
    programs,
  } = useEventHandlers(webContainerBridge);

  // Session cache: per-program editor content. Lost on refresh.
  const editorCacheRef = useRef<Partial<Record<ProgramKey, string>>>({});

  const [editorContent, setEditorContent] = useState<string>(
    () => programs[selectedProgram].source,
  );

  const {
    currentStep: onboardingStep,
    completeStep: completeOnboardingStep,
    restartOnboarding,
  } = useOnboarding();

  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [pauseReason, setPauseReason] = useState<PauseReason>("user");
  /**
   * Identifies the current run. A run that was reset must not set the playback
   * state when its promise finally settles, because an interrupted run settles
   * the same way a completed one does.
   */
  const runIdRef = useRef(0);
  const [speed, setSpeed] = useSpeed();
  /** Pending auto-start from a speed change, waiting out the debounce. */
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Bumped whenever an auto-start is called off. A fired one is still in flight
   * while it flushes the editor, which is long enough for a control to be
   * pressed, so it carries the value it read and drops itself if it moved on.
   */
  const autoStartTokenRef = useRef(0);

  const cancelAutoStart = useCallback(() => {
    autoStartTokenRef.current++;
    if (autoStartTimerRef.current != null) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (autoStartTimerRef.current != null) {
        clearTimeout(autoStartTimerRef.current);
      }
    },
    [],
  );

  const isPlayDisabled =
    canSupportWebContainer &&
    (webContainer.status === "booting" || webContainer.isSyncing);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(true);
  const [editorTabId, setEditorTabId] = useState("program");

  const handleProgramChange = useCallback(
    (programKey: ProgramKey) => {
      cancelAutoStart();
      const { newContent, updatedCache } = computeProgramSwitch(
        selectedProgram,
        programKey,
        editorContent,
        editorCacheRef.current,
        programs,
      );
      editorCacheRef.current = updatedCache;

      setSelectedProgram(programKey);
      setEditorContent(newContent);
      completeOnboardingStep("programSelect");
      handleReset();
      setEditorTabId("program");
      if (webContainer.isReady) {
        webContainer.syncToContainer(newContent);
      }
    },
    [
      selectedProgram,
      editorContent,
      programs,
      setSelectedProgram,
      completeOnboardingStep,
      handleReset,
      webContainer,
      cancelAutoStart,
    ],
  );

  const handleResetToTemplate = useCallback(() => {
    cancelAutoStart();
    const { newContent, updatedCache } = computeResetToTemplate(
      selectedProgram,
      programs,
      editorCacheRef.current,
    );
    editorCacheRef.current = updatedCache;
    setEditorContent(newContent);
    if (webContainer.isReady) {
      webContainer.syncToContainer(newContent);
    }
  }, [selectedProgram, programs, webContainer, cancelAutoStart]);

  const handleProgramContentChange = (content: string) => {
    setEditorContent(content);
    if (webContainer.isReady) {
      webContainer.syncToContainerDebounced(content);
    }
  };

  useEffect(() => {
    if (webContainer.isReady) {
      webContainer.syncToContainer(editorContent);
    }
    // Only sync when container becomes ready; editorContent is intentionally
    // excluded to avoid syncing on every keystroke (debounced sync handles edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webContainer.isReady]);

  const editorTabs = [
    {
      id: "program",
      title: "Program",
      source: editorContent,
      readOnly: !canSupportWebContainer,
      path: `program-${selectedProgram}.ts`,
    },
  ];

  const programSelectorHeader = (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Select
          data-onboarding-step="programSelect"
          value={selectedProgram}
          onChange={(e) => handleProgramChange(e.target.value as ProgramKey)}
          className={cn(
            "h-7 w-full text-xs",
            onboardingStep === "programSelect" && "animate-onboarding-glow",
          )}
        >
          {Object.entries(programs).map(([key, { name }]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </Select>
        {canSupportWebContainer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleResetToTemplate}
                aria-label="Reset to template"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset to template</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );

  const startRun = ({
    startPaused,
    rate = speed,
  }: {
    startPaused: boolean;
    rate?: Speed;
  }) => {
    const runId = ++runIdRef.current;
    const isCurrentRun = () => runIdRef.current === runId;

    setPauseReason("user");
    handlePlay({
      // A gated run stays paused; only a free-running one reaches "running".
      onFirstChunk: () => {
        if (!startPaused) setPlaybackState("running");
      },
      rate,
      startPaused,
    })
      .then(() => {
        if (isCurrentRun()) setPlaybackState("finished");
      })
      .catch(() => {
        if (isCurrentRun()) setPlaybackState("idle");
      });
  };

  const startFromStopped = async (
    rate: Speed,
    isStillWanted: () => boolean = () => true,
  ) => {
    setShowVisualizer(true);
    if (webContainer.isReady) {
      await webContainer.flushSync(editorContent);
    }
    // Whoever pressed a control during that flush wins: starting here too would
    // leave their run racing a second one the Reset button cannot reach.
    if (!isStillWanted()) return;
    setPlaybackState("starting");
    startRun({ startPaused: false, rate });
  };

  const onPlay = async () => {
    cancelAutoStart();
    setShowVisualizer(true);

    // Play doubles as resume: the program is already running, just gated.
    if (playbackState === "paused") {
      handleResume();
      setPlaybackState("running");
      return;
    }

    await startFromStopped(speed);
  };

  /**
   * A live program — running or paused — is retuned where it stands, so slowing
   * one down is possible at the moment you realise you cannot see what is
   * happening. A stopped one has nothing to retune, so it is run again at the
   * new rate rather than leaving the choice with nothing to show. The delay
   * absorbs a keyboard user walking the options — a closed select fires a change
   * per arrow key — instead of spawning a run for each one passed through.
   */
  const onSpeedChange = (next: Speed) => {
    setSpeed(next);
    cancelAutoStart();
    if (playbackState === "running" || playbackState === "paused") {
      handleSetRate(next);
      return;
    }
    if (playbackState !== "idle" && playbackState !== "finished") return;
    if (isPlayDisabled) return;
    const token = autoStartTokenRef.current;
    autoStartTimerRef.current = setTimeout(() => {
      autoStartTimerRef.current = null;
      void startFromStopped(next, () => autoStartTokenRef.current === token);
    }, SPEED_AUTO_START_DELAY_MS);
  };

  const onPause = () => {
    handlePause();
    setPauseReason("user");
    setPlaybackState("paused");
  };

  const onStep = async () => {
    cancelAutoStart();
    // With nothing running, Step starts the program already gated so that its
    // first events can be stepped through; there is no other way into a paused
    // run. As with Play, a finished program starts over.
    if (playbackState === "idle" || playbackState === "finished") {
      setShowVisualizer(true);
      // Same flush as Play: the container would otherwise step through whatever
      // it was last given rather than what is on screen.
      if (webContainer.isReady) {
        await webContainer.flushSync(editorContent);
      }
      startRun({ startPaused: true });
      setPlaybackState("paused");
      setPauseReason("user");
      return;
    }

    // A step is a round trip on the container path, so the outcome that decides
    // whether the program is stuck arrives asynchronously on both.
    const outcome = await handleStep();
    if (outcome === null) return;
    if (outcome._tag === "finished") {
      setPlaybackState("finished");
      return;
    }
    setPauseReason(outcome._tag === "noProgress" ? "stuck" : "user");
  };

  const onReset = () => {
    cancelAutoStart();
    runIdRef.current++;
    setPlaybackState("idle");
    setPauseReason("user");
    handleReset();
  };

  // The same rules the buttons are enabled by, so a shortcut cannot reach a
  // control the UI is refusing — a run started while the container was still
  // booting would be one the Reset button cannot see.
  const availability = getPlaybackAvailability({
    state: playbackState,
    pauseReason,
    isPlayDisabled,
  });

  /**
   * The keyboard path to Run/Pause. It retires the onboarding step the way the
   * button does, so a visitor who found the keyboard is not pulsed at forever.
   */
  const onPlayPauseShortcut = () => {
    if (playbackState === "running") {
      if (availability.canPause) onPause();
      return;
    }
    if (!availability.canPlay) return;
    completeOnboardingStep("play");
    void onPlay();
  };

  /** The keyboard path to Step, retiring its onboarding step the same way. */
  const onStepShortcut = () => {
    if (!availability.canStep) return;
    completeOnboardingStep("step");
    void onStep();
  };

  useKeyboardShortcuts({
    onPlayPause: onPlayPauseShortcut,
    onStep: onStepShortcut,
  });

  // Monaco resolves these itself; see registerPlaybackActions in CodeEditor.
  const editorShortcuts = { onPlayPauseShortcut, onStepShortcut };

  return (
    <div
      className={`
        flex h-dvh flex-col overflow-auto overscroll-contain bg-background
      `}
    >
      <Header />

      {/* Desktop: Resizable split layout */}
      <div
        className={`
          hidden flex-1 overflow-hidden
          md:block
        `}
      >
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize={40} minSize={25}>
            {showLogsPanel ? (
              <ResizablePanelGroup orientation="vertical" className="h-full">
                <ResizablePanel defaultSize={75} minSize={30}>
                  <div className="flex h-full min-w-0 flex-col">
                    <MultiModelEditor
                      tabs={editorTabs}
                      value={editorTabId}
                      onValueChange={setEditorTabId}
                      onProgramContentChange={handleProgramContentChange}
                      typesReady={webContainer.typesReady}
                      {...editorShortcuts}
                      headerExtra={programSelectorHeader}
                      className="flex h-full min-w-0 flex-col"
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle className="h-auto w-full">
                  <div
                    className={cn(
                      "flex h-4 cursor-row-resize items-center justify-center",
                      "border-y border-border bg-muted/20",
                    )}
                    aria-hidden
                  >
                    <GripHorizontal
                      className="size-3.5 text-muted-foreground/50"
                      aria-hidden
                    />
                  </div>
                </ResizableHandle>
                <ResizablePanel defaultSize={25} minSize={10}>
                  <WebContainerLogsPanel
                    expanded={showLogsPanel}
                    onToggle={() => setShowLogsPanel((v) => !v)}
                    webContainerMode={canSupportWebContainer}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="flex h-full min-w-0 flex-col">
                <MultiModelEditor
                  tabs={editorTabs}
                  value={editorTabId}
                  onValueChange={setEditorTabId}
                  onProgramContentChange={handleProgramContentChange}
                  typesReady={webContainer.typesReady}
                  {...editorShortcuts}
                  headerExtra={programSelectorHeader}
                  className="flex h-full min-w-0 flex-col"
                />
                <WebContainerLogsPanel
                  expanded={showLogsPanel}
                  onToggle={() => setShowLogsPanel((v) => !v)}
                  webContainerMode={canSupportWebContainer}
                />
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-hidden">
                <VisualizerPanel />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: Editor full width + sliding visualizer */}
      <div
        className={`
          relative flex-1 overflow-hidden
          md:hidden
        `}
      >
        {/* Editor - always full width */}
        <div className="flex h-full min-w-0 flex-col">
          {showLogsPanel ? (
            <ResizablePanelGroup
              orientation="vertical"
              className="min-h-0 flex-1"
            >
              <ResizablePanel defaultSize={75} minSize={30}>
                <MultiModelEditor
                  tabs={editorTabs}
                  value={editorTabId}
                  onValueChange={setEditorTabId}
                  onProgramContentChange={handleProgramContentChange}
                  typesReady={webContainer.typesReady}
                  {...editorShortcuts}
                  headerExtra={programSelectorHeader}
                  className="flex h-full min-w-0 flex-col"
                />
              </ResizablePanel>
              <ResizableHandle className="h-auto w-full">
                <div
                  className={cn(
                    "flex h-4 cursor-row-resize items-center justify-center",
                    "border-y border-border bg-muted/20",
                  )}
                  aria-hidden
                >
                  <GripHorizontal
                    className="size-3.5 text-muted-foreground/50"
                    aria-hidden
                  />
                </div>
              </ResizableHandle>
              <ResizablePanel defaultSize={25} minSize={10}>
                <WebContainerLogsPanel
                  expanded={showLogsPanel}
                  onToggle={() => setShowLogsPanel((v) => !v)}
                  webContainerMode={canSupportWebContainer}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <>
              <div className="min-h-0 flex-1">
                <MultiModelEditor
                  tabs={editorTabs}
                  value={editorTabId}
                  onValueChange={setEditorTabId}
                  onProgramContentChange={handleProgramContentChange}
                  typesReady={webContainer.typesReady}
                  {...editorShortcuts}
                  headerExtra={programSelectorHeader}
                  className="flex h-full min-w-0 flex-col"
                />
              </div>
              <WebContainerLogsPanel
                expanded={showLogsPanel}
                onToggle={() => setShowLogsPanel((v) => !v)}
                webContainerMode={canSupportWebContainer}
              />
            </>
          )}
        </div>

        {/* Visualizer - slides in from right */}
        <div
          className={`
            absolute inset-0 z-10 transform bg-background transition-transform
            duration-300 ease-in-out
            ${showVisualizer ? "translate-x-0" : "translate-x-full"}
          `}
        >
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-hidden">
              <VisualizerPanel />
            </div>
          </div>
        </div>
      </div>

      <PlaybackControls
        state={playbackState}
        onPlay={onPlay}
        onPause={onPause}
        onStep={onStep}
        onReset={onReset}
        showVisualizer={showVisualizer}
        onToggleVisualizer={() => setShowVisualizer(!showVisualizer)}
        onboardingStep={onboardingStep}
        onOnboardingComplete={completeOnboardingStep}
        onRestartOnboarding={restartOnboarding}
        isPlayDisabled={isPlayDisabled}
        isSyncing={canSupportWebContainer && webContainer.isSyncing}
        speed={speed}
        onSpeedChange={onSpeedChange}
        pauseReason={pauseReason}
      />
    </div>
  );
}
