import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ExecutionLog } from "./ExecutionLog";
import { FiberTreeView } from "./FiberTreeView";
import { TimelineView } from "./TimelineView";

export function VisualizerPanel() {
  return (
    <Tabs defaultValue="fibers" className="flex h-full flex-col">
      <TabsList className="mx-4 mt-2 grid w-auto grid-cols-3">
        <TabsTrigger value="fibers">Fibers</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="log">Log</TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-hidden p-4 pt-2">
        <TabsContent value="fibers" className="mt-0 h-full">
          <FiberTreeView />
        </TabsContent>
        <TabsContent value="timeline" className="mt-0 h-full">
          <TimelineView />
        </TabsContent>
        <TabsContent value="log" className="mt-0 h-full">
          <ExecutionLog />
        </TabsContent>
      </div>
    </Tabs>
  );
}
