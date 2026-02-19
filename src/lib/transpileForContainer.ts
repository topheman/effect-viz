/**
 * Transpiles TypeScript to JavaScript for execution in the WebContainer.
 * Uses esbuild-wasm (browser-compatible). Call initEsbuildWasm() before first transform.
 */
import * as esbuild from "esbuild-wasm";

let initPromise: Promise<void> | null = null;

/**
 * Initialize esbuild-wasm. Call once before any transpile. Safe to call multiple times.
 */
export async function initEsbuildWasm(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = esbuild.initialize({
    wasmURL: "https://unpkg.com/esbuild-wasm/esbuild.wasm",
  });
  return initPromise;
}

/**
 * Transpile TypeScript to ESM JavaScript for the container.
 * Throws with a clear message on syntax/transform errors.
 */
export async function transpileForContainer(ts: string): Promise<string> {
  await initEsbuildWasm();

  try {
    const result = await esbuild.transform(ts, {
      loader: "ts",
      format: "esm",
      sourcefile: "program.ts",
      sourcemap: "inline",
    });
    return result.code;
  } catch (e) {
    const errObj = e as {
      errors?: Array<{
        text: string;
        location?: { line: number; column: number };
      }>;
    };
    if (errObj?.errors?.length) {
      const err = errObj.errors[0];
      const msg = err?.location
        ? `Transpile error at ${err.location.line}:${err.location.column}: ${err.text}`
        : (err?.text ?? String(e));
      throw new Error(msg);
    }
    if (e instanceof Error) throw e;
    throw new Error(`Transpile failed: ${String(e)}`);
  }
}
