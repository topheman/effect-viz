import { MainLayout } from "@/components/layout/MainLayout";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { FiberStoreProvider } from "@/stores/fiberStore";
import { TraceStoreProvider } from "@/stores/traceStore";
import { WebContainerLogsStoreProvider } from "@/stores/webContainerLogsStore";

function App() {
  return (
    <TraceStoreProvider>
      <FiberStoreProvider>
        <WebContainerLogsStoreProvider>
          <MainLayout />
          <PwaUpdatePrompt />
        </WebContainerLogsStoreProvider>
      </FiberStoreProvider>
    </TraceStoreProvider>
  );
}

export default App;
