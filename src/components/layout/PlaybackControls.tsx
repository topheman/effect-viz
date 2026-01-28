import { Pause, Play, RotateCcw, SkipForward, StepForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PlaybackState = "idle" | "running" | "paused" | "finished";

interface PlaybackControlsProps {
  state?: PlaybackState;
  onPlay?: () => void;
  onPause?: () => void;
  onStep?: () => void;
  onStepOver?: () => void;
  onReset?: () => void;
}

export function PlaybackControls({
  state = "idle",
  onPlay,
  onPause,
  onStep,
  onStepOver,
  onReset,
}: PlaybackControlsProps) {
  const isRunning = state === "running";
  const canPlay = state === "idle" || state === "paused";
  const canStep = state === "idle" || state === "paused";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`
          flex h-12 shrink-0 items-center justify-center gap-1 border-t
          border-border bg-card px-4
        `}
      >
        {/* Play / Pause */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={isRunning ? onPause : onPlay}
              disabled={!canPlay && !isRunning}
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

        {/* Step Over */}
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

        {/* Reset */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset</TooltipContent>
        </Tooltip>

        {/* Status indicator */}
        <div
          className={`
            ml-4 flex items-center gap-2 text-sm text-muted-foreground
          `}
        >
          <div
            className={`
              h-2 w-2 rounded-full
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
    </TooltipProvider>
  );
}
