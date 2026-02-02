import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  buildFiberTree,
  type FiberTreeNode,
  getFiberStateColor,
  useFiberStore,
} from "@/stores/fiberStore";

/**
 * Renders a single fiber node and its children recursively.
 */
function FiberNode({
  node,
  depth = 0,
}: {
  node: FiberTreeNode;
  depth?: number;
}) {
  const { fiber, children } = node;
  const isSuspended = fiber.state === "suspended";

  return (
    <div className="font-mono text-sm">
      <div
        className="flex items-center gap-2 py-1"
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
        <FiberNode key={child.fiber.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function FiberTreeView() {
  const { fibers, rootFiber } = useFiberStore();

  // Build tree structure from root
  const tree = rootFiber ? buildFiberTree(fibers, rootFiber.id) : undefined;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        className={`
          shrink-0 pb-0
          md:pb-3
        `}
      >
        <CardTitle className="text-base">Fiber Tree</CardTitle>
        <CardDescription className={cn(tree ? "hidden" : "block", "md:block")}>
          Visualize fiber hierarchy and relationships
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {!tree ? (
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
            <FiberNode node={tree} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
