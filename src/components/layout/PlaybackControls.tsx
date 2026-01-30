import {
  Braces,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  StepForward,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { InfoModal } from "./InfoModal";

const STEP_IS_IMPLEMENTED = false;
const STEP_OVER_IS_IMPLEMENTED = false;
const PAUSE_IS_IMPLEMENTED = false;

export type PlaybackState = "idle" | "running" | "paused" | "finished";

interface PlaybackControlsProps {
  state?: PlaybackState;
  onPlay?: () => void;
  onPause?: () => void;
  onStep?: () => void;
  onStepOver?: () => void;
  onReset?: () => void;
  showVisualizer?: boolean;
  onToggleVisualizer?: () => void;
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
}: PlaybackControlsProps) {
  const isRunning = state === "running";
  const canPlay = state === "idle" || state === "paused";
  const canStep = state === "idle" || state === "paused";

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
                variant="ghost"
                size="icon"
                onClick={onToggleVisualizer}
                className="md:hidden"
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
                variant="ghost"
                size="icon"
                onClick={isRunning ? onPause : onPlay}
                disabled={
                  (!canPlay && !isRunning) ||
                  (isRunning && !PAUSE_IS_IMPLEMENTED)
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
                    : state === "paused"
                      ? "bg-yellow-500"
                      : state === "finished"
                        ? "bg-blue-500"
                        : "bg-muted-foreground"
                }
              `}
            />
            <span className="capitalize">{state}</span>
          </div>
        </div>

        {/* Right: Info button */}
        <div className="flex w-9 items-center justify-end">
          <InfoModal />
        </div>
      </div>
    </TooltipProvider>
  );
}
