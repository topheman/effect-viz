import { Effect } from "effect";

import { makeTraceEmitterLayer, withTrace } from "@/runtime/tracedRunner";
import { useTraceStore } from "@/stores/traceStore";

export function useEventHandlers() {
  // In MainLayout or a new hook
  const { addEvent, clear } = useTraceStore();

  const handlePlay = () => {
    clear(); // Reset previous trace

    const sampleEffect = Effect.succeed("Hello from Effect!");

    const traced = withTrace(sampleEffect, "sample-effect");
    const layer = makeTraceEmitterLayer(addEvent);

    Effect.runPromise(traced.pipe(Effect.provide(layer))).then(console.log);
  };

  return { handlePlay };
}
