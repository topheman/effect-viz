import { MainLayout } from "@/components/layout/MainLayout";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { FiberStoreProvider } from "@/stores/fiberStore";
import { TraceStoreProvider } from "@/stores/traceStore";

function App() {
  return (
    <TraceStoreProvider>
      <FiberStoreProvider>
        <MainLayout />
        <PwaUpdatePrompt />
      </FiberStoreProvider>
    </TraceStoreProvider>
  );
}

export default App;
