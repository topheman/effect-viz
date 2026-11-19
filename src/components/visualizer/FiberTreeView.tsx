import { useId } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  selectChange,
  toggleChangesPanel,
  useChangesPanel,
} from "@/hooks/useChangesPanel";
import { targetLogRow } from "@/hooks/useLogTarget";
import { useLogView } from "@/hooks/useLogView";
import { setVisualizerTab } from "@/hooks/useVisualizerTab";
import { eventGroup } from "@/lib/eventGroups";
import type { PlaybackState } from "@/lib/playbackAvailability";
import { type TraceChange, traceChanges } from "@/lib/traceChanges";
import { TRACE_CHANGE_TEXT } from "@/lib/traceChangeText";
import { cn } from "@/lib/utils";
import {
  buildFiberTree,
  type FiberTreeNode,
  getFiberStateColor,
  useFiberStore,
} from "@/stores/fiberStore";
import { useTraceStore } from "@/stores/traceStore";
import type { TraceEvent } from "@/types/trace";

/**
 * Renders a single fiber node and its children recursively.
 */
function FiberNode({
  node,
  depth = 0,
  highlighted,
}: {
  node: FiberTreeNode;
  depth?: number;
  highlighted: ReadonlySet<string>;
}) {
  const { fiber, children } = node;
  const isSuspended = fiber.state === "suspended";
  const isHighlighted = highlighted.has(fiber.id);

  return (
    <div className="font-mono text-sm">
      <div
        data-testid="fiber-node"
        data-highlighted={isHighlighted || undefined}
        className={cn(
          "flex items-center gap-2 rounded-sm py-1",
          isHighlighted && "bg-primary/15",
        )}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {/* Connector line for non-root nodes */}
        {depth > 0 && <span className="text-muted-foreground">└─</span>}

        {/* Fiber state badge */}
        <span
          className={cn(
            getFiberStateColor(fiber.state),
            isSuspended && "animate-pulse",
          )}
        >
          [{fiber.state}]
        </span>

        {/* Fiber label */}
        <span className="text-foreground">
          {fiber.label || `Fiber ${fiber.id.slice(0, 8)}`}
        </span>

        {/* Sleep indicator */}
        {isSuspended && (
          <span
            className="text-xs text-yellow-400/70"
            title="Fiber is sleeping"
          >
            zzz
          </span>
        )}
      </div>

      {/* Render children recursively */}
      {children.map((child) => (
        <FiberNode
          key={child.fiber.id}
          node={child}
          depth={depth + 1}
          highlighted={highlighted}
        />
      ))}
    </div>
  );
}

/** `text` with its backquoted spans set as code. */
function WithCode({ text }: { text: string }) {
  return text
    .split("`")
    .map((part, i) =>
      i % 2 === 1 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>,
    );
}

/** The Effect 3 → 4 changes the trace shows, one entry per kind, in place of the tree. */
function ChangesPanel({
  changes,
  events,
  selected,
  linksActive,
}: {
  changes: TraceChange[];
  events: TraceEvent[];
  selected: TraceChange["kind"] | null;
  linksActive: boolean;
}) {
  const [{ hidden }] = useLogView();
  // One per mounted copy: the layouts render the card more than once.
  const headingId = useId();
  // The numbers the log shows, which skip its hidden rows.
  const rowNumbers = new Map<number, number>();
  for (const [index, event] of events.entries()) {
    if (!hidden.has(eventGroup(event))) {
      rowNumbers.set(index, rowNumbers.size + 1);
    }
  }
  const followRow = (index: number) => {
    targetLogRow(events, index);
    setVisualizerTab("log");
  };

  return (
    <section
      aria-labelledby={headingId}
      className="h-full overflow-y-auto text-sm"
    >
      <h3 id={headingId} className="font-medium">
        What changed in Effect 4
      </h3>
      {!linksActive && (
        <p className="text-xs text-muted-foreground">
          Pause to follow a row to the log.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {changes.map((change) => {
          const text = TRACE_CHANGE_TEXT[change.kind];
          const isSelected = selected === change.kind;
          const rows = change.rows.flatMap((index) => {
            const number = rowNumbers.get(index);
            return number === undefined ? [] : [{ index, number }];
          });
          return (
            <li
              key={change.kind}
              className={cn(
                "rounded-md border p-2 transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => selectChange(events, change.kind)}
                className="w-full cursor-pointer text-left font-medium"
              >
                {text.title}
              </button>
              <p className="mt-1 text-xs">
                <span className="font-semibold">Effect 4</span>{" "}
                <WithCode text={text.effect4} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-semibold">Effect 3</span>{" "}
                <WithCode text={text.effect3} />
              </p>
              {rows.length > 0 && (
                <p
                  className={`
                    mt-1 flex flex-wrap items-center gap-x-1 font-mono text-xs
                  `}
                >
                  <span className="font-sans text-muted-foreground">Rows</span>
                  {rows.map(({ index, number }) => (
                    <button
                      key={index}
                      type="button"
                      disabled={!linksActive}
                      aria-label={`Row ${number} in the Execution Log`}
                      onClick={() => followRow(index)}
                      className={`
                        inline-flex min-h-6 min-w-6 cursor-pointer items-center
                        justify-center text-primary underline underline-offset-2
                        disabled:cursor-default disabled:text-muted-foreground
                        disabled:no-underline
                      `}
                    >
                      [{number}]
                    </button>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FiberTreeView({
  playbackState = "idle",
}: {
  /** Row links reach the log only once it stops following the newest row. */
  playbackState?: PlaybackState;
}) {
  const { fibers, rootFiber } = useFiberStore();
  const { events } = useTraceStore();
  const changes = traceChanges(events);
  const panel = useChangesPanel(events);
  const showChanges = panel.open && changes.length > 0;
  const highlighted = new Set(
    changes.find((change) => change.kind === panel.selected)?.fibers,
  );

  // Build tree structure from root
  const tree = rootFiber ? buildFiberTree(fibers, rootFiber.id) : undefined;

  return (
    <Card className="relative flex h-full flex-col">
      {/* In the landscape tabs the title is hidden and the changes button
          floats over the card, as the Execution Log's options button does. */}
      <CardHeader
        className={`
          shrink-0 pb-0
          md:pb-3
          max-md:short:[container-type:normal] max-md:short:absolute
          max-md:short:top-2.5 max-md:short:right-2.5 max-md:short:z-10
          max-md:short:px-0
        `}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle
            className={`
              text-base
              max-md:short:hidden
            `}
          >
            Fiber Tree
          </CardTitle>
          {changes.length > 0 && (
            <button
              type="button"
              aria-pressed={showChanges}
              aria-label={`What changed in Effect 4, ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
              onClick={() => toggleChangesPanel(events)}
              className={cn(
                `
                  -m-1.5 inline-flex shrink-0 cursor-pointer items-center
                  rounded-md p-1.5 font-mono text-xs whitespace-nowrap
                  transition-colors
                  hover:text-foreground
                  max-md:short:bg-card
                `,
                showChanges ? "text-foreground" : "text-muted-foreground",
              )}
            >
              v3 → v4 · {changes.length}
            </button>
          )}
        </div>
        <CardDescription
          className={cn(
            showChanges
              ? "hidden"
              : cn(
                  tree ? "hidden" : "block",
                  `
                    md:block
                    max-md:short:hidden
                  `,
                ),
          )}
        >
          Visualize fiber hierarchy and relationships
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {showChanges ? (
          <ChangesPanel
            changes={changes}
            events={events}
            selected={panel.selected}
            linksActive={
              playbackState === "paused" || playbackState === "finished"
            }
          />
        ) : !tree ? (
          <div
            className={`
              flex h-full items-center justify-center text-center
              text-muted-foreground
            `}
          >
            <div>
              <p className="text-sm">No fibers to display</p>
              <p className="mt-1 text-xs">
                Run an Effect program to see fibers
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <FiberNode node={tree} highlighted={highlighted} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
