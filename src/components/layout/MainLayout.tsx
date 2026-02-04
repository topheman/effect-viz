import { useState } from "react";

import { CodeEditor } from "@/components/editor/CodeEditor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Select } from "@/components/ui/select";
import { VisualizerPanel } from "@/components/visualizer/VisualizerPanel";
import { useEventHandlers } from "@/hooks/useEventHandlers";
import { useOnboarding } from "@/hooks/useOnboarding";
import type { ProgramKey } from "@/lib/programs";
import { cn } from "@/lib/utils";

import { Header } from "./Header";
import { PlaybackControls, type PlaybackState } from "./PlaybackControls";

export function MainLayout() {
  const {
    handlePlay,
    handleReset,
    selectedProgram,
    setSelectedProgram,
    programs,
  } = useEventHandlers();

  const {
    currentStep: onboardingStep,
    completeStep: completeOnboardingStep,
    restartOnboarding,
  } = useOnboarding();

  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [showVisualizer, setShowVisualizer] = useState(false);

  // Get the source code for the selected program
  const programSource = programs[selectedProgram].source;

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
            <div className="flex h-full flex-col">
              <div
                className={`
                  flex shrink-0 items-center justify-between gap-2 border-b
                  border-border bg-muted/50 px-4 py-2
                `}
              >
                <span className="text-sm font-medium text-muted-foreground">
                  Program
                </span>
                <Select
                  data-onboarding-step="programSelect"
                  value={selectedProgram}
                  onChange={(e) => {
                    setSelectedProgram(e.target.value as ProgramKey);
                    completeOnboardingStep("programSelect");
                  }}
                  className={cn(
                    "h-7 w-40 text-xs",
                    onboardingStep === "programSelect" &&
                      "origin-center animate-onboarding-pulse",
                  )}
                >
                  {Object.entries(programs).map(([key, { name }]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <CodeEditor
                value={programSource}
                readOnly
                className="flex-1 overflow-hidden"
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
        <div className="flex h-full flex-col">
          <div
            className={`
              flex shrink-0 items-center justify-between gap-2 border-b
              border-border bg-muted/50 px-4 py-2
            `}
          >
            <span className="text-sm font-medium text-muted-foreground">
              Program
            </span>
            <Select
              data-onboarding-step="programSelect"
              value={selectedProgram}
              onChange={(e) => {
                setSelectedProgram(e.target.value as ProgramKey);
                completeOnboardingStep("programSelect");
              }}
              className={cn(
                "h-7 w-40 text-xs",
                onboardingStep === "programSelect" &&
                  "origin-center animate-onboarding-pulse",
              )}
            >
              {Object.entries(programs).map(([key, { name }]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <CodeEditor
            value={programSource}
            readOnly
            className="flex-1 overflow-hidden"
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
      />
    </div>
  );
}
