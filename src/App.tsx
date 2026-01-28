import { MainLayout } from "@/components/layout/MainLayout";
import { TraceStoreProvider } from "@/stores/traceStore";

function App() {
  return (
    <TraceStoreProvider>
      <MainLayout />
    </TraceStoreProvider>
  );
}

export default App;
