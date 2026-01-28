import { useState } from "react";

import { CodeEditor } from "@/components/editor/CodeEditor";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { VisualizerPanel } from "@/components/visualizer/VisualizerPanel";
import { useEventHandlers } from "@/hooks/useEventHandlers";

import { Header } from "./Header";
import { PlaybackControls, type PlaybackState } from "./PlaybackControls";

export function MainLayout() {
  const { handlePlay } = useEventHandlers();

  const [code, setCode] = useState<string | undefined>();
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");

  const onPlay = () => {
    setPlaybackState("running");
    handlePlay();
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

  const handleReset = () => {
    setPlaybackState("idle");
    // TODO: Reset Effect execution
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Code Editor Panel */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="flex h-full flex-col">
            <div
              className={`shrink-0 border-b border-border bg-muted/50 px-4 py-2`}
            >
              <span className="text-sm font-medium text-muted-foreground">
                Editor
              </span>
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              className="flex-1 overflow-hidden"
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Visualizer Panel */}
        <ResizablePanel defaultSize={60} minSize={30}>
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
        </ResizablePanel>
      </ResizablePanelGroup>

      <PlaybackControls
        state={playbackState}
        onPlay={onPlay}
        onPause={handlePause}
        onStep={handleStep}
        onStepOver={handleStepOver}
        onReset={handleReset}
      />
    </div>
  );
}
