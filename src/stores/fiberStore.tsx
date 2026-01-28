import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { FiberInfo, FiberState, TraceEvent } from "@/types/trace";

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

  /**
   * Process a TraceEvent and update fiber state accordingly.
   *
   * TODO 1: Implement the event processing logic
   *
   * When you receive:
   * - "fiber:fork" → Create a new FiberInfo with state "running"
   * - "fiber:end" → Update fiber state to "completed"
   * - "fiber:interrupt" → Update fiber state to "interrupted"
   *
   * Don't forget to update parent's children array on fork!
   */
  const processEvent = useCallback((event: TraceEvent) => {
    setFibers((prev) => {
      const next = new Map(prev);

      switch (event.type) {
        case "fiber:fork": {
          // TODO: Create new FiberInfo
          // Hints:
          // - id: event.fiberId
          // - parentId: event.parentId
          // - state: "running"
          // - startTime: event.timestamp ?? Date.now()
          // - children: []
          //
          // Also update parent's children array if parentId exists
          break;
        }

        case "fiber:end": {
          // TODO: Update fiber state to "completed"
          // Hints:
          // - Get existing fiber: next.get(event.fiberId)
          // - Update state and endTime
          break;
        }

        case "fiber:interrupt": {
          // TODO: Update fiber state to "interrupted"
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

  /**
   * TODO 2: Compute the root fiber
   *
   * The root fiber is the one with no parentId.
   * Find it in the fibers map.
   */
  const rootFiber = useMemo(() => {
    // TODO: Find and return the fiber with no parentId
    // Hint: Use Array.from(fibers.values()).find(...)
    return undefined;
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
 * TODO 3: Build a tree structure from flat fiber map
 *
 * This is useful for rendering the FiberTreeView recursively.
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

  // TODO: Recursively build the tree
  // Hints:
  // - Get the root fiber
  // - For each childId in root.children, recursively call buildFiberTree
  // - Return { fiber: root, children: [...] }

  return {
    fiber: root,
    children: [], // TODO: Map over root.children and recurse
  };
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
