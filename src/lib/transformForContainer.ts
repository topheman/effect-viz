/**
 * Transforms editor content for execution inside the WebContainer.
 *
 * Programs export rootEffect and requirements; the fixed runner.js injects
 * TraceEmitter and runs. Only import path fix is needed (container has no @/ alias).
 */

/**
 * Transform editor source for container execution.
 * Fixes import paths: @/runtime/* or ./tracedRunner → ./runtime.js (Node ESM requires .js).
 * The runner.js bootstraps execution; user code does not need makeTraceEmitterLayer.
 */
export function transformImportsForContainer(source: string): string {
  let result = source;

  // Replace @/runtime paths (tracedRunner, runtime, etc.) → ./runtime.js
  result = result.replace(
    /from\s+["']@\/[^"']*runtime["']/g,
    'from "./runtime.js"',
  );
  result = result.replace(
    /from\s+["']@\/[^"']*tracedRunner["']/g,
    'from "./runtime.js"',
  );
  // Also fix ./tracedRunner or ./runtime without .js
  result = result.replace(
    /from\s+["']\.\/tracedRunner["']/g,
    'from "./runtime.js"',
  );
  result = result.replace(/from\s+["']\.\/runtime["']/g, 'from "./runtime.js"');

  return result;
}
