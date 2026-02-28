// From tracedRunner (V1 manual instrumentation)
export {
  makeTraceEmitterLayer as _makeTraceEmitterLayer,
  retryWithTrace as retry,
  addFinalizerWithTrace as addFinalizer,
  acquireReleaseWithTrace as acquireRelease,
} from "./tracedRunner";

// TraceEmitter needed for Layer type signatures
export { TraceEmitter as _TraceEmitter } from "./traceEmitter";

// From vizSupervisor (V2)
export { makeVizLayers as _makeVizLayers } from "./vizSupervisor";

// Run fork + join with trace emission (DRY for useEventHandlers & WebContainer)
export {
  runProgramFork as _runProgramFork,
  type RunProgramForkResult,
} from "./runProgram";

export { makeVizTracer as _makeVizTracer } from "./vizTracer";
