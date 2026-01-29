import { GripHorizontal } from "lucide-react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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

export function VisualizerPanel() {
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
          <TimelineView />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
