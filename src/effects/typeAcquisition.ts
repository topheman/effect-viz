/**
 * Type acquisition for Monaco editor.
 *
 * Acquires Effect types from WebContainer's node_modules/effect and app lib types
 * (tracedRunner, trace, traceEmitter, crypto) from public, then adds them to Monaco.
 *
 * Must run after npm install in the boot Effect. Requires WebContainer.
 */
import { loader } from "@monaco-editor/react";
import * as Effect from "effect/Effect";

import type { WebContainerHandle } from "@/services/webcontainer";
import { WebContainer } from "@/services/webcontainer";

/**
 * App lib types emitted by `npm run build:tracedrunner` (tsc -p tsconfig.tracedrunner.json).
 * `scripts/extract-dts-from-tracedrunner.mjs` extracts the .d.ts files into this JSON file.
 *
 * The files are served from public/app/ and added to Monaco for @/ paths resolution.
 */
import APP_LIB_URLS from "./app-lib-dts-urls.json";

function addExtraLib(
  content: string,
  path: string,
  monaco: Awaited<ReturnType<typeof loader.init>>,
) {
  monaco.languages.typescript.typescriptDefaults.addExtraLib(content, path);
}

/**
 * Recursively collect all .d.ts files from a directory and add them to Monaco.
 * Paths are prefixed with file:/// so module resolution works.
 * Can acquire types from any node_modules package (e.g. node_modules/effect, node_modules/other-pkg).
 */
function acquireNodeModulesTypes(
  handle: WebContainerHandle,
  basePath: string,
  monaco: Awaited<ReturnType<typeof loader.init>>,
  added: Set<string>,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const entries = yield* handle.readDirectory(basePath);
    for (const entry of entries) {
      const fullPath = `${basePath}/${entry.name}`;
      const normalizedPath = fullPath.replace(/^\/+/, "");
      if (entry.isDirectory()) {
        yield* acquireNodeModulesTypes(handle, fullPath, monaco, added);
      } else if (entry.name.endsWith(".d.ts") && !added.has(fullPath)) {
        const bytes = yield* handle.readFile(fullPath);
        const content = new TextDecoder().decode(bytes);
        const libPath = `file:///${normalizedPath}`;
        yield* Effect.sync(() => addExtraLib(content, libPath, monaco));
        added.add(fullPath);
      }
    }
  }).pipe(Effect.catchAll(() => Effect.void));
}

/**
 * Fetch app lib types (from APP_LIB_URLS) from public and add to Monaco.
 */
function acquireAppLibs(
  monaco: Awaited<ReturnType<typeof loader.init>>,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    for (const { url, path } of APP_LIB_URLS) {
      yield* Effect.tryPromise({
        try: () => fetch(url).then((r) => r.text()),
        catch: (e) => new Error(`Failed to fetch ${url}: ${e}`),
      }).pipe(
        Effect.flatMap((content) =>
          Effect.sync(() => addExtraLib(content, path, monaco)),
        ),
        Effect.catchAll(() => Effect.void),
      );
    }
  });
}

/**
 * Configure Monaco TypeScript compiler options for module resolution.
 * baseUrl + @/* are always set. pathsOverride is merged into paths (can add or override).
 */
function configureMonacoPaths(
  monaco: Awaited<ReturnType<typeof loader.init>>,
  pathsOverride?: Record<string, string[]>,
) {
  const opts =
    monaco.languages.typescript.typescriptDefaults.getCompilerOptions();
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    ...opts,
    baseUrl: "file:///",
    paths: {
      ...(opts.paths ?? {}),
      "@/*": ["*"],
      ...pathsOverride,
    },
  });
}

/**
 * Acquire Monaco types for mobile fallback (no WebContainer).
 * Fetches fallback-types.d.ts (Effect stubs) and app libs from public/app/.
 */
export const acquireMonacoTypesFallback: Effect.Effect<void, Error> =
  Effect.gen(function* () {
    const monaco = yield* Effect.promise(() => loader.init());
    configureMonacoPaths(monaco);

    const fallbackContent = yield* Effect.tryPromise({
      try: () => fetch("/fallback-types.d.ts").then((r) => r.text()),
      catch: (e) => new Error(`Failed to fetch fallback-types.d.ts: ${e}`),
    });
    addExtraLib(fallbackContent, "file:///fallback-types.d.ts", monaco);

    yield* acquireAppLibs(monaco);
  });

/**
 * Acquire all types for Monaco: Effect from container, app libs from public.
 * Adds them to Monaco's TypeScript extra libs. Run after npm install in boot.
 */
export const acquireMonacoTypes: Effect.Effect<
  void,
  never,
  WebContainerHandle
> = Effect.gen(function* () {
  const handle = yield* WebContainer;
  const monaco = yield* Effect.promise(() => loader.init());
  configureMonacoPaths(monaco, {
    effect: ["node_modules/effect/dist/dts/index.d.ts"],
    "effect/*": ["node_modules/effect/dist/dts/*"],
  });
  const added = new Set<string>();
  yield* acquireNodeModulesTypes(handle, "node_modules/effect", monaco, added);
  yield* acquireAppLibs(monaco);
});
