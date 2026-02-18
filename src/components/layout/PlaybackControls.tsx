import {
  Braces,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  StepForward,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OnboardingStepId } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

import { InfoModal } from "./InfoModal";

const STEP_IS_IMPLEMENTED = false;
const STEP_OVER_IS_IMPLEMENTED = false;
const PAUSE_IS_IMPLEMENTED = false;

export type PlaybackState =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "finished";

interface PlaybackControlsProps {
  state?: PlaybackState;
  onPlay?: () => void;
  onPause?: () => void;
  onStep?: () => void;
  onStepOver?: () => void;
  onReset?: () => void;
  showVisualizer?: boolean;
  onToggleVisualizer?: () => void;
  onboardingStep?: OnboardingStepId | null;
  onOnboardingComplete?: (stepId: OnboardingStepId) => void;
  onRestartOnboarding?: () => void;
  /** When true, Play is disabled (e.g. WebContainer still booting) */
  isPlayDisabled?: boolean;
}

export function PlaybackControls({
  state = "idle",
  onPlay,
  onPause,
  onStep,
  onStepOver,
  onReset,
  showVisualizer = true,
  onToggleVisualizer,
  onboardingStep = null,
  onOnboardingComplete,
  onRestartOnboarding,
  isPlayDisabled = false,
}: PlaybackControlsProps) {
  const isRunning = state === "running";
  const canPlay = (state === "idle" || state === "paused") && !isPlayDisabled;
  const canStep = state === "idle" || state === "paused";
  const [playMountAnimationEnded, setPlayMountAnimationEnded] = useState(false);

  // Skip showVisualizer step on desktop (toggle is hidden)
  useEffect(() => {
    if (
      onboardingStep === "showVisualizer" &&
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches &&
      onOnboardingComplete
    ) {
      onOnboardingComplete("showVisualizer");
    }
  }, [onboardingStep, onOnboardingComplete]);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`
          flex h-12 shrink-0 items-center justify-between border-t border-border
          bg-card px-4
        `}
      >
        {/* Left: Mobile toggle visualizer */}
        <div
          className={`
            flex w-9 items-center
            md:w-9
          `}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-onboarding-step="showVisualizer"
                variant="ghost"
                size="icon"
                onClick={() => {
                  onToggleVisualizer?.();
                  onOnboardingComplete?.("showVisualizer");
                }}
                className={cn(
                  "md:hidden",
                  onboardingStep === "showVisualizer" &&
                    "origin-center animate-onboarding-pulse",
                )}
                style={
                  {
                    "--onboarding-pulse-x": "20%",
                    "--onboarding-pulse-y": "-30%",
                    zIndex:
                      onboardingStep === "showVisualizer" ? "100" : "auto",
                  } as React.CSSProperties
                }
              >
                {showVisualizer ? (
                  <Braces className="h-4 w-4" />
                ) : (
                  <Workflow className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showVisualizer ? "Hide Visualizer" : "Show Visualizer"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Center: Playback controls */}
        <div className="flex items-center gap-1">
          {/* Reset */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset</TooltipContent>
          </Tooltip>

          {/* Play / Pause */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-onboarding-step="play"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (isRunning) {
                    onPause?.();
                  } else {
                    onPlay?.();
                    onOnboardingComplete?.("play");
                  }
                }}
                disabled={
                  (!canPlay && !isRunning) ||
                  (isRunning && !PAUSE_IS_IMPLEMENTED)
                }
                onAnimationEnd={(e) => {
                  if (e.animationName === "play-button-mount") {
                    setPlayMountAnimationEnded(true);
                  }
                }}
                className={cn(
                  !playMountAnimationEnded && "animate-play-button-mount",
                  playMountAnimationEnded &&
                    onboardingStep === "play" &&
                    "origin-center animate-onboarding-pulse",
                )}
                style={
                  {
                    "--onboarding-pulse-x": "0",
                    "--onboarding-pulse-y": "-30%",
                    zIndex: onboardingStep === "play" ? "100" : "auto",
                  } as React.CSSProperties
                }
              >
                {isRunning ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isRunning ? "Pause" : "Run"}</TooltipContent>
          </Tooltip>

          {/* Step */}
          {STEP_IS_IMPLEMENTED && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onStep}
                  disabled={!canStep}
                >
                  <StepForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step</TooltipContent>
            </Tooltip>
          )}

          {/* Step Over */}
          {STEP_OVER_IS_IMPLEMENTED && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onStepOver}
                  disabled={!canStep}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Step Over</TooltipContent>
            </Tooltip>
          )}

          {/* Status indicator */}
          <div
            className={`
              ml-4 flex w-20 items-center gap-2 text-sm text-muted-foreground
            `}
          >
            <div
              className={`
                h-2 w-2 shrink-0 rounded-full
                ${
                  state === "running"
                    ? "animate-pulse bg-green-500"
                    : state === "starting"
                      ? "animate-pulse bg-orange-500"
                      : state === "paused"
                        ? "bg-yellow-500"
                        : state === "finished"
                          ? "bg-blue-500"
                          : "bg-muted-foreground"
                }
              `}
            />
            <span className="capitalize">
              {state === "starting" ? "starting..." : state}
            </span>
          </div>
        </div>

        {/* Right: Info button */}
        <div className="flex w-9 items-center justify-end">
          <InfoModal
            onboardingStep={onboardingStep}
            onOnboardingComplete={onOnboardingComplete}
            onRestartOnboarding={onRestartOnboarding}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
