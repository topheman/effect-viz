import { GripVerticalIcon } from "lucide-react";
import * as React from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup(props: React.ComponentProps<typeof PanelGroup>) {
  return <PanelGroup data-slot="resizable-panel-group" {...props} />;
}

// `className` lands on the library's inner flex item, which otherwise keeps
// `min-width: auto` and never shrinks below content Monaco sized in pixels.
function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={cn("min-w-0", className)}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        // Zero-size separators, with `before:` drawing the line, so crossing
        // handles overlap end to end and both drag from where they meet.
        `
          relative flex w-0 items-center justify-center
          before:absolute before:inset-y-0 before:left-1/2 before:w-px
          before:-translate-x-1/2 before:bg-border
          after:absolute after:inset-y-0 after:left-1/2 after:w-1
          after:-translate-x-1/2
          focus-visible:ring-1 focus-visible:ring-ring
          focus-visible:ring-offset-1 focus-visible:outline-hidden
          aria-[orientation=horizontal]:h-0 aria-[orientation=horizontal]:w-full
          aria-[orientation=horizontal]:before:left-0
          aria-[orientation=horizontal]:before:h-px
          aria-[orientation=horizontal]:before:w-full
          aria-[orientation=horizontal]:before:translate-x-0
          aria-[orientation=horizontal]:before:-translate-y-1/2
          aria-[orientation=horizontal]:after:left-0
          aria-[orientation=horizontal]:after:h-1
          aria-[orientation=horizontal]:after:w-full
          aria-[orientation=horizontal]:after:translate-x-0
          aria-[orientation=horizontal]:after:-translate-y-1/2
          [&[aria-orientation=horizontal]>div]:rotate-90
        `,
        `
          data-[separator=active]:ring-1 data-[separator=active]:ring-ring
          data-[separator=hover]:ring-1 data-[separator=hover]:ring-ring
          data-[separator=inactive]:ring-0
          data-[separator=inactive]:focus-visible:ring-0
          data-[separator=inactive]:focus-visible:ring-offset-0
          data-[separator=inactive]:focus-visible:outline-none
        `,
        className,
      )}
      {...props}
    >
      {withHandle && (
        // v4 lets an element painted above a separator block its hit, so the
        // grip must let the pointer through where two handles cross.
        <div
          className={`
            pointer-events-none z-10 flex h-4 w-3 shrink-0 items-center
            justify-center rounded-xs border bg-border
          `}
        >
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
