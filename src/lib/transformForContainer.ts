/**
 * Transforms editor content for execution inside the WebContainer.
 *
 * Programs export rootEffect and requirements; the fixed runner.js injects
 * TraceEmitter and runs. Only import path fix is needed (container has no @/ alias).
 */

/**
 * Transform editor source for container execution.
 * Only fixes import paths: @/runtime/tracedRunner → ./tracedRunner.js (Node ESM requires .js).
 * The runner.js bootstraps execution; user code does not need runProgramWithTrace or makeTraceEmitterLayer.
 */
export function transformImportsForContainer(source: string): string {
  let result = source;

  // Replace import path: @/runtime/tracedRunner → ./tracedRunner.js (Node ESM requires .js)
  result = result.replace(
    /from\s+["']@\/[^"']*tracedRunner["']/g,
    'from "./tracedRunner.js"',
  );
  // Also fix ./tracedRunner without .js
  result = result.replace(
    /from\s+["']\.\/tracedRunner["']/g,
    'from "./tracedRunner.js"',
  );

  return result;
}
