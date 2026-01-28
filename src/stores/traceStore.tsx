import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { TraceEvent } from "@/types/trace";

interface TraceStore {
  /** All recorded trace events in order */
  events: TraceEvent[];
  /** Add a new event to the trace */
  addEvent: (event: TraceEvent) => void;
  /** Clear all events */
  clear: () => void;
}

const TraceStoreContext = createContext<TraceStore | null>(null);

interface TraceStoreProviderProps {
  children: React.ReactNode;
}

export function TraceStoreProvider({ children }: TraceStoreProviderProps) {
  const [events, setEvents] = useState<TraceEvent[]>([]);

  const addEvent = useCallback((event: TraceEvent) => {
    // Add timestamp if not provided
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    };
    setEvents((prev) => [...prev, eventWithTimestamp]);
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  const store = useMemo(
    () => ({
      events,
      addEvent,
      clear,
    }),
    [events, addEvent, clear],
  );

  return (
    <TraceStoreContext.Provider value={store}>
      {children}
    </TraceStoreContext.Provider>
  );
}

/**
 * Hook to access the trace store.
 * Must be used within a TraceStoreProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTraceStore(): TraceStore {
  const store = useContext(TraceStoreContext);
  if (!store) {
    throw new Error("useTraceStore must be used within a TraceStoreProvider");
  }
  return store;
}
