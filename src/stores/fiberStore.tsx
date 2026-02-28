/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { FiberInfo, FiberState, TraceEvent } from "@/types/trace";

function createFiberInfo(fiberInfo: FiberInfo): FiberInfo {
  return fiberInfo;
}

// =============================================================================
// FiberStore Interface
// =============================================================================

interface FiberStore {
  /** Map of fiber ID to FiberInfo */
  fibers: Map<string, FiberInfo>;
  /** Get the root fiber (the one with no parent) */
  rootFiber: FiberInfo | undefined;
  /** Process a trace event to update fiber state */
  processEvent: (event: TraceEvent) => void;
  /** Clear all fibers */
  clear: () => void;
}

const FiberStoreContext = createContext<FiberStore | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface FiberStoreProviderProps {
  children: React.ReactNode;
}

export function FiberStoreProvider({ children }: FiberStoreProviderProps) {
  const [fibers, setFibers] = useState<Map<string, FiberInfo>>(new Map());

  const processEvent = useCallback((event: TraceEvent) => {
    setFibers((prev) => {
      const next = new Map(prev);

      switch (event.type) {
        case "fiber:fork": {
          const fiberInfo = createFiberInfo({
            id: event.fiberId,
            parentId: event.parentId,
            state: "running",
            label: event.label,
            startTime: event.timestamp ?? Date.now(),
            children: [],
          });
          // Update parent's children array if parent exits
          if (event.parentId) {
            const parent = next.get(event.parentId);
            if (parent) {
              next.set(parent.id, {
                ...parent,
                children: [
                  ...new Set([...parent.children, event.fiberId]).values(),
                ],
              });
            }
          }
          next.set(event.fiberId, fiberInfo);
          break;
        }

        case "fiber:end": {
          const fiberInfo = next.get(event.fiberId);
          if (fiberInfo) {
            next.set(event.fiberId, { ...fiberInfo, state: "completed" });
          }
          break;
        }

        case "fiber:interrupt": {
          const fiberInfo = next.get(event.fiberId);
          if (fiberInfo) {
            next.set(event.fiberId, { ...fiberInfo, state: "interrupted" });
          }
          break;
        }

        case "fiber:suspend": {
          const fiberInfo = next.get(event.fiberId);
          // Effect's Supervisor calls onSuspend both when a fiber yields (e.g. sleep)
          // and when it completes (in a finally block). The latter would overwrite
          // completed/interrupted with suspended. Only apply if not yet terminated.
          if (
            fiberInfo &&
            fiberInfo.state !== "completed" &&
            fiberInfo.state !== "interrupted"
          ) {
            next.set(event.fiberId, { ...fiberInfo, state: "suspended" });
          }
          break;
        }

        case "fiber:resume": {
          const fiberInfo = next.get(event.fiberId);
          if (fiberInfo) {
            next.set(event.fiberId, { ...fiberInfo, state: "running" });
          }
          break;
        }

        // Ignore other event types for now
        default:
          break;
      }

      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFibers(new Map());
  }, []);

  const rootFiber = useMemo(() => {
    return Array.from(fibers.values()).find((fiber) => !fiber.parentId);
  }, [fibers]);

  const store = useMemo(
    () => ({
      fibers,
      rootFiber,
      processEvent,
      clear,
    }),
    [fibers, rootFiber, processEvent, clear],
  );

  return (
    <FiberStoreContext.Provider value={store}>
      {children}
    </FiberStoreContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the fiber store.
 * Must be used within a FiberStoreProvider.
 */
export function useFiberStore(): FiberStore {
  const store = useContext(FiberStoreContext);
  if (!store) {
    throw new Error("useFiberStore must be used within a FiberStoreProvider");
  }
  return store;
}

// =============================================================================
// Helper: Build tree structure for rendering
// =============================================================================

export interface FiberTreeNode {
  fiber: FiberInfo;
  children: FiberTreeNode[];
}

/**
 * Builds a tree of FiberTreeNode from a flat Map of FiberInfo, starting at the given rootId.
 * Used for recursive rendering of the FiberTreeView.
 *
 * @param fibers - Map of all fibers
 * @param rootId - ID of the root fiber to start from
 * @returns Tree structure starting from root
 */
export function buildFiberTree(
  fibers: Map<string, FiberInfo>,
  rootId: string,
): FiberTreeNode | undefined {
  const root = fibers.get(rootId);
  if (!root) return undefined;

  const rootFiber: FiberTreeNode = {
    fiber: root,
    children: [],
  };

  rootFiber.children = root.children
    .map((fiberId) => buildFiberTree(fibers, fiberId))
    .filter((child) => !!child);

  return rootFiber;
}

// =============================================================================
// Helper: Get color for fiber state
// =============================================================================

export function getFiberStateColor(state: FiberState): string {
  switch (state) {
    case "running":
      return "text-green-400";
    case "suspended":
      return "text-yellow-400";
    case "completed":
      return "text-blue-400";
    case "interrupted":
      return "text-red-400";
  }
}
