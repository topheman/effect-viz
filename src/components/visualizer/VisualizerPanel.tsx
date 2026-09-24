import { GripHorizontal } from "lucide-react";
import { useState } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ExecutionLog } from "./ExecutionLog";
import { FiberTreeView } from "./FiberTreeView";
import { TimelineView } from "./TimelineView";

function TimelineHeader() {
  return (
    <div
      className={`
        flex h-10 shrink-0 cursor-row-resize items-center gap-2 bg-muted/30 px-3
      `}
    >
      <GripHorizontal className="h-4 w-4 text-muted-foreground/50" />
      <span className="text-sm font-medium text-muted-foreground">
        Timeline
      </span>
    </div>
  );
}

/** Fiber Tree + Execution Log with resizable split (desktop only) */
function MainContent() {
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
          <ResizablePanel defaultSize={50} minSize={25}>
            <div className="h-full p-2 pr-1">
              <FiberTreeView />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={25}>
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
          <FiberTreeView />
        </div>
        <div className="min-h-0 flex-1">
          <ExecutionLog />
        </div>
      </div>
    </>
  );
}

const VIEWS = [
  { value: "fibers", label: "Fiber Tree" },
  { value: "log", label: "Execution Log" },
  { value: "timeline", label: "Timeline" },
] as const;

type View = (typeof VIEWS)[number]["value"];

/**
 * One view at a time, for a phone in landscape: stacked, each view would get
 * about 45px, which is its own title.
 */
function TabbedViews({ timelineDurationMs }: { timelineDurationMs?: number }) {
  const [view, setView] = useState<View>("log");

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as View)}
      className="h-full gap-0 p-2 pt-1"
    >
      <TabsList variant="line" className="h-8 w-full shrink-0 gap-1">
        {VIEWS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value} className="text-xs">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="fibers" className="mt-1 min-h-0">
        <FiberTreeView />
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
}: {
  /** Starting width of the timeline's time axis, for the selected program. */
  timelineDurationMs?: number;
}) {
  return (
    <>
      <div
        className={`
          hidden h-full
          max-md:short:block
        `}
      >
        <TabbedViews timelineDurationMs={timelineDurationMs} />
      </div>
      <div
        className={`
          h-full
          max-md:short:hidden
        `}
      >
        <StackedViews timelineDurationMs={timelineDurationMs} />
      </div>
    </>
  );
}

function StackedViews({ timelineDurationMs }: { timelineDurationMs?: number }) {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full">
      <ResizablePanel defaultSize={65} minSize={20}>
        <MainContent />
      </ResizablePanel>

      {/* Timeline header IS the resize handle */}
      <ResizableHandle className="h-auto w-full">
        <TimelineHeader />
      </ResizableHandle>

      <ResizablePanel defaultSize={35} minSize={15}>
        <div className="h-full overflow-hidden p-2">
          <TimelineView defaultDurationMs={timelineDurationMs} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
