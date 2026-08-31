import {
  Braces,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OnboardingStepId } from "@/hooks/useOnboarding";
import { SPEED_OPTIONS, type Speed, formatSpeed } from "@/hooks/useSpeed";
import { cn } from "@/lib/utils";

import { InfoModal } from "./InfoModal";

export type PlaybackState =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "finished";

/**
 * Why execution is paused. Only a user pause can be stepped: `stuck` means
 * nothing is runnable and no deadline is pending, so a step would do nothing.
 *
 * A stuck program is either deadlocked or waiting on something outside. Telling
 * those apart needs a fiber's status, which is itself an Effect and so needs the
 * scheduler that a pause is holding.
 */
export type PauseReason = "user" | "stuck";

interface PlaybackControlsProps {
  state?: PlaybackState;
  onPlay?: () => void;
  onPause?: () => void;
  onStep?: () => void;
  onReset?: () => void;
  showVisualizer?: boolean;
  onToggleVisualizer?: () => void;
  onboardingStep?: OnboardingStepId | null;
  onOnboardingComplete?: (stepId: OnboardingStepId) => void;
  onRestartOnboarding?: () => void;
  /** When true, Play is disabled (e.g. WebContainer still booting) */
  isPlayDisabled?: boolean;
  /** When true, show "Syncing..." in status (e.g. flushing editor to container) */
  isSyncing?: boolean;
  /** Playback speed applied on the next run */
  speed?: Speed;
  onSpeedChange?: (speed: Speed) => void;
  /** Only meaningful while paused; decides whether Step can do anything */
  pauseReason?: PauseReason;
}

export function PlaybackControls({
  state = "idle",
  onPlay,
  onPause,
  onStep,
  onReset,
  showVisualizer = true,
  onToggleVisualizer,
  onboardingStep = null,
  onOnboardingComplete,
  onRestartOnboarding,
  isPlayDisabled = false,
  isSyncing = false,
  speed = 1,
  onSpeedChange,
  pauseReason = "user",
}: PlaybackControlsProps) {
  const isRunning = state === "running";
  // Play doubles as resume (from paused) and re-run (from finished).
  const canPlay =
    (state === "idle" || state === "paused" || state === "finished") &&
    !isPlayDisabled;
  // Step from a stopped program starts it already gated, so its very first
  // events can be stepped through; like Play, that includes re-running one that
  // has finished. Otherwise stepping needs a live, frozen program, and a stuck
  // pause has nothing the runtime could release.
  const canStep =
    ((state === "idle" || state === "finished") && !isPlayDisabled) ||
    (state === "paused" && pauseReason === "user");
  const canPause = isRunning;
  // Nothing to reset before the first run.
  const canReset = state !== "idle";
  // The rate is fixed when the program starts: the WebContainer receives it as a
  // spawn environment variable and cannot be retuned until it is restarted.
  const canChangeSpeed = state !== "running" && state !== "starting";
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
              <Button
                aria-label="Reset"
                variant="ghost"
                size="icon"
                onClick={onReset}
                disabled={!canReset}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset</TooltipContent>
          </Tooltip>

          {/* Play / Pause */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={isRunning ? "Pause" : "Run"}
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
                disabled={(!canPlay && !isRunning) || (isRunning && !canPause)}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Step"
                data-onboarding-step="step"
                variant="ghost"
                size="icon"
                onClick={() => {
                  onStep?.();
                  onOnboardingComplete?.("step");
                }}
                disabled={!canStep}
                className={cn(
                  onboardingStep === "step" &&
                    canStep &&
                    "origin-center animate-onboarding-pulse",
                )}
                style={
                  {
                    "--onboarding-pulse-x": "0",
                    "--onboarding-pulse-y": "-30%",
                    zIndex:
                      onboardingStep === "step" && canStep ? "100" : "auto",
                  } as React.CSSProperties
                }
              >
                <StepForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {state === "paused" && pauseReason === "stuck"
                ? "Nothing can run: deadlocked, or waiting on something outside"
                : state === "idle" || state === "finished"
                  ? "Start paused, then step"
                  : "Step"}
            </TooltipContent>
          </Tooltip>

          {/* Status indicator */}
          <div
            className={`
              ml-4 flex w-24 min-w-24 items-center gap-2 text-sm
              text-muted-foreground
            `}
          >
            <div
              className={`
                h-2 w-2 shrink-0 rounded-full
                ${
                  isSyncing
                    ? "animate-pulse bg-orange-500"
                    : state === "running"
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
            <span data-testid="playback-status" className="capitalize">
              {isSyncing
                ? "Syncing..."
                : state === "starting"
                  ? "starting..."
                  : state}
            </span>
          </div>

          {/* Speed */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Select
                aria-label="Playback speed"
                className="h-8 w-[4.5rem] px-2"
                value={speed}
                disabled={!canChangeSpeed}
                onChange={(e) =>
                  onSpeedChange?.(Number(e.target.value) as Speed)
                }
              >
                {SPEED_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatSpeed(option)}
                  </option>
                ))}
              </Select>
            </TooltipTrigger>
            <TooltipContent>
              {canChangeSpeed
                ? "Speed — slows the program's own clock"
                : "Speed applies on the next run"}
            </TooltipContent>
          </Tooltip>
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
