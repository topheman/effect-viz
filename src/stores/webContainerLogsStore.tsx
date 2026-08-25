import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Which stream an entry came from, and how the console treats it.
 *
 * - `boot` — the visualizer's own progress while starting the container
 * - `output` — anything the program wrote to stdout, rendered with ANSI colours
 * - `error` — shown in the Errors tab rather than the Logs tab
 * - `control` — commands the page sent the container, echoed back by its
 *   terminal; hidden unless the user asks to see the visualizer's internals
 */
export type WebContainerLogLabel = "boot" | "output" | "error" | "control";

export interface WebContainerLogEntry {
  label: WebContainerLogLabel;
  message: string;
  timestamp?: number;
}

interface WebContainerLogsStore {
  /** All logged entries in order */
  logs: WebContainerLogEntry[];
  /** Add a new log entry */
  addLog: (label: WebContainerLogLabel, message: string) => void;
  /** Clear all logs */
  clear: () => void;
  /** Clear logs only (keeps errors) */
  clearLogs: () => void;
  /** Clear errors only */
  clearErrors: () => void;
}

const WebContainerLogsStoreContext =
  createContext<WebContainerLogsStore | null>(null);

interface WebContainerLogsStoreProviderProps {
  children: React.ReactNode;
}

export function WebContainerLogsStoreProvider({
  children,
}: WebContainerLogsStoreProviderProps) {
  const [logs, setLogs] = useState<WebContainerLogEntry[]>([]);

  const addLog = useCallback((label: WebContainerLogLabel, message: string) => {
    setLogs((prev) => [...prev, { label, message, timestamp: Date.now() }]);
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs((prev) => prev.filter((e) => e.label === "error"));
  }, []);

  const clearErrors = useCallback(() => {
    setLogs((prev) => prev.filter((e) => e.label !== "error"));
  }, []);

  const store = useMemo(
    () => ({
      logs,
      addLog,
      clear,
      clearLogs,
      clearErrors,
    }),
    [logs, addLog, clear, clearLogs, clearErrors],
  );

  return (
    <WebContainerLogsStoreContext.Provider value={store}>
      {children}
    </WebContainerLogsStoreContext.Provider>
  );
}

/**
 * Hook to access the WebContainer logs store.
 * Must be used within a WebContainerLogsStoreProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useWebContainerLogsStore(): WebContainerLogsStore {
  const store = useContext(WebContainerLogsStoreContext);
  if (!store) {
    throw new Error(
      "useWebContainerLogsStore must be used within a WebContainerLogsStoreProvider",
    );
  }
  return store;
}
