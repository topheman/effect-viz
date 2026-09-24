/**
 * Type acquisition for Monaco editor.
 *
 * Acquires Effect types (from WebContainer's node_modules/effect, or from
 * public/effect-types.json on the fallback path) and app lib types from public,
 * then adds them to Monaco.
 */
import { loader } from "@monaco-editor/react";
import * as Effect from "effect/Effect";

import type { WebContainerHandle } from "@/services/webcontainer";
import { WebContainer } from "@/services/webcontainer";

/**
 * App lib types emitted by `npm run build:runtime` (tsc -p tsconfig.runtime.json).
 * `scripts/extract-dts-from-runtime.mjs` extracts the .d.ts files into this JSON file.
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
      "@/runtime": ["runtime/index.d.ts"],
      ...pathsOverride,
    },
  });
}

/**
 * Load Monaco itself. Rejects when its CDN assets can't be fetched, so this is a
 * typed error rather than a defect - callers are expected to carry on without types.
 * The rejection value is an unhelpful script `error` event, hence the fixed message.
 */
const initMonaco = Effect.tryPromise({
  try: () => loader.init(),
  catch: (cause) => new Error("Monaco failed to load from the CDN", { cause }),
});

/** The paths under which Monaco finds effect's declarations, on both paths. */
const EFFECT_PATHS = {
  effect: ["node_modules/effect/dist/dts/index.d.ts"],
  "effect/*": ["node_modules/effect/dist/dts/*"],
};

/**
 * Acquire Monaco types for the fallback path (no WebContainer).
 * Fetches effect's real declarations, extracted at build time by
 * `scripts/extract-effect-dts.mjs`, and app libs from public/app/.
 */
export const acquireMonacoTypesFallback: Effect.Effect<void, Error> =
  Effect.gen(function* () {
    const monaco = yield* initMonaco;
    configureMonacoPaths(monaco, EFFECT_PATHS);

    const { files } = yield* Effect.tryPromise({
      try: () =>
        fetch("/effect-types.json").then(
          (r) =>
            r.json() as Promise<{
              files: { path: string; content: string }[];
            }>,
        ),
      catch: (e) => new Error(`Failed to fetch effect-types.json: ${e}`),
    });
    // Monaco syncs extra libs to its worker on the next tick, so adding them in
    // one synchronous loop costs a single sync.
    yield* Effect.sync(() => {
      for (const { path, content } of files) addExtraLib(content, path, monaco);
    });

    yield* acquireAppLibs(monaco);
  });

/**
 * Acquire all types for Monaco: Effect from container, app libs from public.
 * Adds them to Monaco's TypeScript extra libs. Run after npm install in boot.
 */
export const acquireMonacoTypes: Effect.Effect<
  void,
  Error,
  WebContainerHandle
> = Effect.gen(function* () {
  const handle = yield* WebContainer;
  const monaco = yield* initMonaco;
  configureMonacoPaths(monaco, EFFECT_PATHS);
  const added = new Set<string>();
  yield* acquireNodeModulesTypes(handle, "node_modules/effect", monaco, added);
  yield* acquireAppLibs(monaco);
});
