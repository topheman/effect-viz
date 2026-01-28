import { MainLayout } from "@/components/layout/MainLayout";
import { FiberStoreProvider } from "@/stores/fiberStore";
import { TraceStoreProvider } from "@/stores/traceStore";

function App() {
  return (
    <TraceStoreProvider>
      <FiberStoreProvider>
        <MainLayout />
      </FiberStoreProvider>
    </TraceStoreProvider>
  );
}

export default App;
