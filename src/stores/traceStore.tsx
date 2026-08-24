import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { type VirtualAnchor, computeVirtualNow } from "@/lib/timelineTime";
import type { TraceEvent } from "@/types/trace";

interface TraceStore {
  /** All recorded trace events in order */
  events: TraceEvent[];
  /** Add a new event to the trace */
  addEvent: (event: TraceEvent) => void;
  /** Clear all events */
  clear: () => void;
  /** Virtual ms per wall ms for the current run */
  setRate: (rate: number) => void;
  /**
   * Read virtual time straight from the running clock, when there is one to
   * read. Extrapolating from a rate cannot see a paused or stepped clock.
   */
  setNowSource: (nowSource: (() => number) | null) => void;
  /** Current virtual timestamp, in the same units as event timestamps */
  getVirtualNow: () => number;
}

const TraceStoreContext = createContext<TraceStore | null>(null);

interface TraceStoreProviderProps {
  children: React.ReactNode;
}

export function TraceStoreProvider({ children }: TraceStoreProviderProps) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const rateRef = useRef(1);
  const anchorRef = useRef<VirtualAnchor | null>(null);
  const nowSourceRef = useRef<(() => number) | null>(null);

  const addEvent = useCallback((event: TraceEvent) => {
    // Add timestamp if not provided
    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    };
    // The first event of a run pins virtual time to wall time.
    anchorRef.current ??= {
      virtual: eventWithTimestamp.timestamp,
      wall: performance.now(),
    };
    setEvents((prev) => [...prev, eventWithTimestamp]);
  }, []);

  const clear = useCallback(() => {
    anchorRef.current = null;
    nowSourceRef.current = null;
    setEvents([]);
  }, []);

  const setRate = useCallback((rate: number) => {
    rateRef.current = rate;
  }, []);

  const setNowSource = useCallback((nowSource: (() => number) | null) => {
    nowSourceRef.current = nowSource;
  }, []);

  const getVirtualNow = useCallback(
    () =>
      nowSourceRef.current?.() ??
      computeVirtualNow(anchorRef.current, rateRef.current, performance.now()),
    [],
  );

  const store = useMemo(
    () => ({
      events,
      addEvent,
      clear,
      setRate,
      setNowSource,
      getVirtualNow,
    }),
    [events, addEvent, clear, setRate, setNowSource, getVirtualNow],
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
