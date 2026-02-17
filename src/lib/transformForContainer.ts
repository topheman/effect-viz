/**
 * Transforms editor content for execution inside the WebContainer.
 *
 * Applies:
 * 1. Import path: @/runtime/tracedRunner → ./tracedRunner
 * 2. Trace emitter bridge: replace makeTraceEmitterLayer callback with stdout writer
 * 3. Program key: runProgramWithTrace(program, "user")
 */

/** Regex to match makeTraceEmitterLayer callback for replacement (handles multiline) */
const LAYER_CALLBACK_REGEX =
  /makeTraceEmitterLayer\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\}\s*\)/g;

/** Stdout trace emitter - writes TRACE_EVENT: JSON lines for host to parse */
const STDOUT_EMITTER =
  '(event) => process.stdout.write("TRACE_EVENT:" + JSON.stringify(event) + "\\n")';

/** The program key used for user-edited runs */
const USER_PROGRAM_KEY = '"user"';

/**
 * Transform editor source for container execution.
 * - Replaces @/ imports with ./tracedRunner
 * - Replaces makeTraceEmitterLayer callback with stdout writer
 * - Uses "user" as program key for runProgramWithTrace
 */
export function transformForContainer(source: string): string {
  let result = source;

  // 1. Replace import path: @/runtime/tracedRunner, @/..., etc. with ./tracedRunner
  result = result.replace(
    /from\s+["']@\/[^"']*tracedRunner["']/g,
    'from "./tracedRunner"',
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

  return result;
}
