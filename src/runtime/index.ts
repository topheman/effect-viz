// From tracedRunner (V1 manual instrumentation)
export {
  makeTraceEmitterLayer as _makeTraceEmitterLayer,
  retryWithTrace as retry,
  addFinalizerWithTrace as addFinalizer,
  acquireReleaseWithTrace as acquireRelease,
} from "./tracedRunner";

// TraceEmitter needed for Layer type signatures
export { TraceEmitter as _TraceEmitter } from "./traceEmitter";

// Install the visualizer's services and run (shared by useEventHandlers & WebContainer)
export {
  withViz as _withViz,
  runProgramFork as _runProgramFork,
  type RunProgramForkResult,
} from "./runProgram";
export { VirtualClock as _VirtualClock } from "./virtualClock";

// From gatedScheduler / stepper (Phase 10) — pause and step the runtime
export {
  GatedScheduler as _GatedScheduler,
  type SchedulerMode as _SchedulerMode,
} from "./gatedScheduler";
export {
  Stepper as _Stepper,
  type StepOutcome as _StepOutcome,
} from "./stepper";

// From controlChannel (Phase 10) — pause/resume/step over the container's stdio
export {
  applyCommand as _applyCommand,
  decodeCommand as _decodeCommand,
  encodeReply as _encodeReply,
  makeLineReader as _makeLineReader,
  type ControlCommand as _ControlCommand,
  type ControlReply as _ControlReply,
} from "./controlChannel";

// From traceOrigin (Phase 10) — mark the events the visualizer itself caused
export { makeOriginTagger as _makeOriginTagger } from "./traceOrigin";

// From dateShim (Phase 10) — WebContainer only; see the module doc
export { installDateShim as _installDateShim } from "./dateShim";
