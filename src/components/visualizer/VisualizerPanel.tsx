import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVisualizerTab, type VisualizerTab } from "@/hooks/useVisualizerTab";
import type { PlaybackState } from "@/lib/playbackAvailability";

import { ExecutionLog } from "./ExecutionLog";
import { FiberTreeView } from "./FiberTreeView";
import { TimelineView } from "./TimelineView";

/** Fiber Tree + Execution Log with resizable split (desktop only) */
function MainContent({ playbackState }: { playbackState: PlaybackState }) {
  return (
    <>
      {/* Desktop: horizontal resizable split */}
      <div
        className={`
          hidden h-full
          md:block
        `}
      >
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="50%" minSize="25%">
            <div className="h-full p-2 pr-1">
              <FiberTreeView playbackState={playbackState} />
            </div>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Resize fiber tree and execution log"
          />
          <ResizablePanel defaultSize="50%" minSize="25%">
            <div className="h-full p-2 pl-1">
              <ExecutionLog />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: stacked vertically */}
      <div
        className={`
          flex h-full flex-col gap-2 p-2
          md:hidden
        `}
      >
        <div className="min-h-0 flex-1">
          <FiberTreeView playbackState={playbackState} />
        </div>
        <div className="min-h-0 flex-1">
          <ExecutionLog />
        </div>
      </div>
    </>
  );
}

const VIEWS: { value: VisualizerTab; label: string }[] = [
  { value: "fibers", label: "Fiber Tree" },
  { value: "log", label: "Execution Log" },
  { value: "timeline", label: "Timeline" },
];

/**
 * One view at a time, for a phone in landscape: stacked, each view would get
 * about 45px, which is its own title.
 */
function TabbedViews({
  timelineDurationMs,
  playbackState,
}: {
  timelineDurationMs?: number;
  playbackState: PlaybackState;
}) {
  const [view, setView] = useVisualizerTab();

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as VisualizerTab)}
      className="h-full gap-0 px-2 pb-1"
    >
      <TabsList variant="line" className="h-8 w-full shrink-0 gap-1">
        {VIEWS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value} className="text-xs">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="fibers" className="mt-1 min-h-0">
        <FiberTreeView playbackState={playbackState} />
      </TabsContent>
      <TabsContent value="log" className="mt-1 min-h-0">
        <ExecutionLog />
      </TabsContent>
      <TabsContent value="timeline" className="mt-1 min-h-0">
        <TimelineView defaultDurationMs={timelineDurationMs} />
      </TabsContent>
    </Tabs>
  );
}

export function VisualizerPanel({
  timelineDurationMs,
  playbackState,
}: {
  /** Starting width of the timeline's time axis, for the selected program. */
  timelineDurationMs?: number;
  playbackState: PlaybackState;
}) {
  return (
    <>
      <div
        className={`
          hidden h-full
          max-md:short:block
        `}
      >
        <TabbedViews
          timelineDurationMs={timelineDurationMs}
          playbackState={playbackState}
        />
      </div>
      <div
        className={`
          h-full
          max-md:short:hidden
        `}
      >
        <StackedViews
          timelineDurationMs={timelineDurationMs}
          playbackState={playbackState}
        />
      </div>
    </>
  );
}

function StackedViews({
  timelineDurationMs,
  playbackState,
}: {
  timelineDurationMs?: number;
  playbackState: PlaybackState;
}) {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full">
      <ResizablePanel defaultSize="65%" minSize="20%">
        <MainContent playbackState={playbackState} />
      </ResizablePanel>

      <ResizableHandle withHandle aria-label="Resize timeline" />

      <ResizablePanel defaultSize="35%" minSize="15%">
        <div className="h-full overflow-hidden p-2">
          <TimelineView defaultDurationMs={timelineDurationMs} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
