import { RotateCcw } from "lucide-react";
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
import { useOnboarding } from "@/hooks/useOnboarding";
import { useWebContainerBoot } from "@/hooks/useWebContainerBoot";
import { useCanSupportWebContainer } from "@/lib/mobileDetection";
import {
  computeProgramSwitch,
  computeResetToTemplate,
} from "@/lib/programCache";
import type { ProgramKey } from "@/lib/programs";
import { cn } from "@/lib/utils";
import tracedRunnerSource from "@/runtime/tracedRunner.ts?raw";
import traceEmitterSource from "@/runtime/traceEmitter.ts?raw";
import typesSource from "@/types/trace.ts?raw";

import { Header } from "./Header";
import { PlaybackControls, type PlaybackState } from "./PlaybackControls";

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
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(true);
  const [editorTabId, setEditorTabId] = useState("program");

  const handleProgramChange = useCallback(
    (programKey: ProgramKey) => {
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
    ],
  );

  const handleResetToTemplate = useCallback(() => {
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
  }, [selectedProgram, programs, webContainer]);

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
    {
      id: "tracedRunner",
      title: "tracedRunner.ts",
      source: tracedRunnerSource,
    },
    {
      id: "traceEmitter",
      title: "traceEmitter.ts",
      source: traceEmitterSource,
    },
    {
      id: "traceTypes",
      title: "trace.ts",
      source: typesSource,
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
            "h-7 w-[85%] text-xs",
            onboardingStep === "programSelect" &&
              "origin-center animate-onboarding-pulse",
          )}
          style={
            {
              "--onboarding-pulse-x": "-15%",
              "--onboarding-pulse-y": "10%",
              "--onboarding-pulse-scale": "1.5",
            } as React.CSSProperties
          }
        >
          {Object.entries(programs).map(([key, { name }]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </Select>
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
      </div>
    </TooltipProvider>
  );

  const onPlay = async () => {
    setShowVisualizer(true);
    if (webContainer.isReady) {
      await webContainer.flushSync(editorContent);
    }
    setPlaybackState("starting");
    handlePlay({ onFirstChunk: () => setPlaybackState("running") })
      .then(() => setPlaybackState("idle"))
      .catch(() => setPlaybackState("idle")); // e.g. interrupt on program switch
  };

  const handlePause = () => {
    setPlaybackState("paused");
    // TODO: Pause Effect execution
  };

  const handleStep = () => {
    // TODO: Step through Effect execution
  };

  const handleStepOver = () => {
    // TODO: Step over in Effect execution
  };

  const onReset = () => {
    setPlaybackState("idle");
    handleReset();
  };

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
                      headerExtra={programSelectorHeader}
                      className="flex h-full min-w-0 flex-col"
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={25} minSize={10}>
                  <WebContainerLogsPanel
                    expanded={showLogsPanel}
                    onToggle={() => setShowLogsPanel((v) => !v)}
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
                  headerExtra={programSelectorHeader}
                  className="flex h-full min-w-0 flex-col"
                />
                <WebContainerLogsPanel
                  expanded={showLogsPanel}
                  onToggle={() => setShowLogsPanel((v) => !v)}
                />
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="flex h-full flex-col">
              <div
                className={`
                  shrink-0 border-b border-border bg-muted/50 px-4 py-2
                `}
              >
                <span className="text-sm font-medium text-muted-foreground">
                  Visualizer
                </span>
              </div>
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
                  headerExtra={programSelectorHeader}
                  className="flex h-full min-w-0 flex-col"
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25} minSize={10}>
                <WebContainerLogsPanel
                  expanded={showLogsPanel}
                  onToggle={() => setShowLogsPanel((v) => !v)}
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
                  headerExtra={programSelectorHeader}
                  className="flex h-full min-w-0 flex-col"
                />
              </div>
              <WebContainerLogsPanel
                expanded={showLogsPanel}
                onToggle={() => setShowLogsPanel((v) => !v)}
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
            <div
              className={`shrink-0 border-b border-border bg-muted/50 px-4 py-2`}
            >
              <span className="text-sm font-medium text-muted-foreground">
                Visualizer
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <VisualizerPanel />
            </div>
          </div>
        </div>
      </div>

      <PlaybackControls
        state={playbackState}
        onPlay={onPlay}
        onPause={handlePause}
        onStep={handleStep}
        onStepOver={handleStepOver}
        onReset={onReset}
        showVisualizer={showVisualizer}
        onToggleVisualizer={() => setShowVisualizer(!showVisualizer)}
        onboardingStep={onboardingStep}
        onOnboardingComplete={completeOnboardingStep}
        onRestartOnboarding={restartOnboarding}
        isPlayDisabled={
          canSupportWebContainer &&
          (webContainer.status === "booting" || webContainer.isSyncing)
        }
        isSyncing={canSupportWebContainer && webContainer.isSyncing}
      />
    </div>
  );
}
