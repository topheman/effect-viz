/**
 * Transforms editor content for execution inside the WebContainer.
 *
 * Applies:
 * 1. Import path: @/runtime/tracedRunner → ./tracedRunner.js (Node ESM requires .js extension)
 * 2. Trace emitter bridge: replace makeTraceEmitterLayer callback with stdout writer
 * 3. Program key: runProgramWithTrace(program, "user")
 * 4. In-container perf instrumentation when perfEnabled (single "ready" checkpoint before Effect.runFork)
 */

/** Regex to match makeTraceEmitterLayer callback for replacement (handles multiline) */
const LAYER_CALLBACK_REGEX =
  /makeTraceEmitterLayer\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}\s*\)/g;

/** Stdout trace emitter - writes TRACE_EVENT: JSON lines for host to parse */
const STDOUT_EMITTER =
  '(event) => process.stdout.write("TRACE_EVENT:" + JSON.stringify(event) + "\\n")';

/** The program key used for user-edited runs */
const USER_PROGRAM_KEY = '"user"';

/** Single checkpoint before Effect.runFork — ms from process start until ready to run Effect */
const PERF_READY =
  'process.stderr.write("PERF: ready " + performance.now().toFixed(0) + "\\n");';

/**
 * Injects single perf checkpoint before Effect.runFork when perfEnabled.
 * Logs ms from process start → ready to run Effect.
 */
function injectPerfInstrumentation(result: string): string {
  // Match Effect.runFork( whether standalone or in `const x = Effect.runFork(`
  return result.replace(
    /(\n)(\s*(?:const\s+\w+\s*=\s*)?Effect\.runFork\s*\()/,
    `$1${PERF_READY}\n$2`,
  );
}

/**
 * Transform editor source for container execution.
 * - Replaces @/ imports with ./tracedRunner.js
 * - Replaces makeTraceEmitterLayer callback with stdout writer
 * - Uses "user" as program key for runProgramWithTrace
 * - When perfEnabled: injects perf checkpoint before Effect.runFork
 */
export function transformForContainer(
  source: string,
  perfEnabled = false,
): string {
  let result = source;

  // 1. Replace import path: @/runtime/tracedRunner → ./tracedRunner.js (Node ESM requires .js)
  result = result.replace(
    /from\s+["']@\/[^"']*tracedRunner["']/g,
    'from "./tracedRunner.js"',
  );
  // Also fix ./tracedRunner without .js (e.g. INITIAL_PROGRAM, user edits)
  result = result.replace(
    /from\s+["']\.\/tracedRunner["']/g,
    'from "./tracedRunner.js"',
  );

  // 2. Replace makeTraceEmitterLayer callback with stdout writer
  // Match: makeTraceEmitterLayer((event) => { ... })
  result = result.replace(
    LAYER_CALLBACK_REGEX,
    `makeTraceEmitterLayer(${STDOUT_EMITTER})`,
  );

  // 3. Use fixed "user" for runProgramWithTrace(program, "...")
  // Match: runProgramWithTrace(program, "key") or runProgramWithTrace(program, 'key')
  result = result.replace(
    /runProgramWithTrace\s*\(\s*(\w+)\s*,\s*["'][^"']*["']\s*\)/g,
    `runProgramWithTrace($1, ${USER_PROGRAM_KEY})`,
  );

  // 4. Inject perf instrumentation when enabled (PERF_PLAY=1 passed at spawn)
  if (perfEnabled) {
    result = injectPerfInstrumentation(result);
  }

  return result;
}
