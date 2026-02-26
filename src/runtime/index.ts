// From tracedRunner (V1 manual instrumentation)
export {
  withTrace,
  forkWithTrace,
  makeTraceEmitterLayer,
  runProgramWithTrace,
  sleepWithTrace,
  retryWithTrace,
  addFinalizerWithTrace,
  acquireReleaseWithTrace,
} from "./tracedRunner";

// TraceEmitter needed for Layer type signatures
export { TraceEmitter } from "./traceEmitter";

// From vizSupervisor (V2)
export { makeVizLayers } from "./vizSupervisor";

// Run fork + join with trace emission (DRY for useEventHandlers & WebContainer)
export { runProgramFork, type RunProgramForkResult } from "./runProgram";
