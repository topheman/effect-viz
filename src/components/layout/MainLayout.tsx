import { useEffect, useState } from "react";

import { MultiModelEditor } from "@/components/editor/MultiModelEditor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Select } from "@/components/ui/select";
import { VisualizerPanel } from "@/components/visualizer/VisualizerPanel";
import { useEventHandlers } from "@/hooks/useEventHandlers";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useWebContainerBoot } from "@/hooks/useWebContainerBoot";
import type { ProgramKey } from "@/lib/programs";
import { cn } from "@/lib/utils";
import tracedRunnerSource from "@/runtime/tracedRunner.ts?raw";
import traceEmitterSource from "@/runtime/traceEmitter.ts?raw";
import typesSource from "@/types/trace.ts?raw";

import { Header } from "./Header";
import { PlaybackControls, type PlaybackState } from "./PlaybackControls";

export function MainLayout() {
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
  const [editorTabId, setEditorTabId] = useState("program");

  const handleProgramChange = (programKey: ProgramKey) => {
    const source = programs[programKey].source;
    setSelectedProgram(programKey);
    setEditorContent(source);
    completeOnboardingStep("programSelect");
    handleReset();
    setEditorTabId("program");
    if (webContainer.isReady) {
      webContainer.syncToContainer(source);
    }
  };

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
      readOnly: false,
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

  const onPlay = () => {
    setPlaybackState("running");
    setShowVisualizer(true);
    handlePlay().then(() => {
      setPlaybackState("idle");
    });
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
            <div className="flex h-full min-w-0 flex-col">
              <MultiModelEditor
                tabs={editorTabs}
                value={editorTabId}
                onValueChange={setEditorTabId}
                onProgramContentChange={handleProgramContentChange}
                headerExtra={
                  <Select
                    data-onboarding-step="programSelect"
                    value={selectedProgram}
                    onChange={(e) =>
                      handleProgramChange(e.target.value as ProgramKey)
                    }
                    className={cn(
                      "h-7 w-40 text-xs",
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
                }
                className="flex h-full min-w-0 flex-col"
              />
            </div>
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
          <MultiModelEditor
            tabs={editorTabs}
            value={editorTabId}
            onValueChange={setEditorTabId}
            onProgramContentChange={handleProgramContentChange}
            headerExtra={
              <Select
                data-onboarding-step="programSelect"
                value={selectedProgram}
                onChange={(e) =>
                  handleProgramChange(e.target.value as ProgramKey)
                }
                className={cn(
                  "h-7 w-40 text-xs",
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
            }
            className="flex h-full min-w-0 flex-col"
          />
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
        isPlayDisabled={webContainer.status === "booting"}
      />
    </div>
  );
}
