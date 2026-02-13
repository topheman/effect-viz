import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface WebContainerLogEntry {
  label: string;
  message: string;
  timestamp?: number;
}

interface WebContainerLogsStore {
  /** All logged entries in order */
  logs: WebContainerLogEntry[];
  /** Add a new log entry */
  addLog: (label: string, message: string) => void;
  /** Clear all logs */
  clear: () => void;
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

  const addLog = useCallback((label: string, message: string) => {
    setLogs((prev) => [...prev, { label, message, timestamp: Date.now() }]);
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  const store = useMemo(
    () => ({
      logs,
      addLog,
      clear,
    }),
    [logs, addLog, clear],
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
