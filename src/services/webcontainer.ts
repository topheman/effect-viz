/**
 * WebContainer Effect Service.
 *
 * Boots a single WebContainer instance, mounts the inner project template,
 * runs pnpm install, and provides writeFile/spawn/run.
 *
 * Requires: npm install @webcontainer/api
 */
import { WebContainer as WC, type FileSystemTree } from "@webcontainer/api";
import { Context, Effect, GlobalValue, Layer } from "effect";

import { WebContainerLogs } from "@/services/webContainerLogs";

// ---
// Inner project template (mounted at container root)
// ---

const PACKAGE_JSON = `{
  "name": "effectviz-inner",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "pnpm exec tsx program.ts"
  },
  "dependencies": {
    "effect": "^3.19.15",
    "tsx": "^4.19.0",
    "typescript": "~5.9.3"
  }
}
`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["*.ts", "*.js"]
}
`;

const INITIAL_PROGRAM = `// Program will be synced from editor
import { Effect } from "effect";
import { runProgramWithTrace, makeTraceEmitterLayer } from "./tracedRunner";

const program = Effect.succeed("Hello from WebContainer!");
const traced = runProgramWithTrace(program, "user");
const layer = makeTraceEmitterLayer((event) =>
  process.stdout.write("TRACE_EVENT:" + JSON.stringify(event) + "\\n")
);
Effect.runFork(traced.pipe(Effect.provide(layer)));
`;

// ---
// Semaphore: only one WebContainer at a time
// ---

const semaphore = GlobalValue.globalValue("app/WebContainer/semaphore", () =>
  Effect.unsafeMakeSemaphore(1),
);

// ---
// Service definition
// ---

export interface WebContainerHandle {
  readonly writeFile: (path: string, content: string) => Effect.Effect<void>;
  readonly readFile: (path: string) => Effect.Effect<Uint8Array, Error>;
  readonly readDirectory: (
    path: string,
  ) => Effect.Effect<
    Array<{ name: string; isDirectory: () => boolean }>,
    Error
  >;
  readonly spawn: (
    command: string,
    args: string[],
    options?: { output?: boolean },
  ) => Effect.Effect<
    Awaited<ReturnType<Awaited<typeof WC.prototype.spawn>>>,
    unknown
  >;
}

export const WebContainer =
  Context.GenericTag<WebContainerHandle>("app/WebContainer");

function filesToTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [path, content] of Object.entries(files)) {
    tree[path] = { file: { contents: content } };
  }
  return tree;
}

/**
 * WebContainer Layer - scoped, single instance.
 * Boots container, mounts template, runs npm install.
 * Requires WebContainerLogs to be provided (e.g. via Layer.merge).
 */
export const WebContainerLive = Layer.scoped(
  WebContainer,
  Effect.gen(function* () {
    const logs = yield* WebContainerLogs;

    yield* logs.log("boot", "0/6 Boot started (scope entered)");
    yield* logs.log("boot", "1/6 Acquiring semaphore...");
    yield* Effect.acquireRelease(semaphore.take(1), () =>
      Effect.gen(function* () {
        yield* logs.log("boot", "1/6 Semaphore released (on scope close)");
        yield* semaphore.release(1);
      }),
    );
    yield* logs.log("boot", "1/6 Semaphore acquired");

    yield* logs.log("boot", "2/6 Booting WebContainer...");
    const container = yield* Effect.acquireRelease(
      Effect.promise(() => WC.boot()),
      (c) =>
        Effect.gen(function* () {
          yield* logs.log("boot", "2/6 WebContainer teardown (on scope close)");
          yield* Effect.sync(() => c.teardown());
        }),
    );
    yield* logs.log("boot", "2/6 WebContainer booted");

    yield* logs.log("boot", "3/6 Fetching tracedRunner.js...");
    const tracedRunnerJs = yield* Effect.tryPromise({
      try: () => fetch("/app/tracedRunner.js").then((r) => r.text()),
      catch: (e) => new Error(`Failed to fetch tracedRunner.js: ${e}`),
    });
    yield* logs.log(
      "boot",
      `3/6 tracedRunner.js fetched ${JSON.stringify({ length: tracedRunnerJs.length })}`,
    );

    const files: Record<string, string> = {
      "package.json": PACKAGE_JSON,
      "tsconfig.json": TSCONFIG_JSON,
      "tracedRunner.js": tracedRunnerJs,
      "program.ts": INITIAL_PROGRAM,
    };

    yield* logs.log("boot", "4/6 Mounting files...");
    yield* Effect.promise(() => container.mount(filesToTree(files)));
    yield* logs.log("boot", "4/6 Files mounted");

    yield* logs.log("boot", "5/6 Running pnpm install...");
    const installProcess = yield* Effect.promise(() =>
      container.spawn("pnpm", ["install"], { output: false }),
    );
    const exitCode = yield* Effect.promise(() => installProcess.exit);
    yield* logs.log(
      "boot",
      `5/6 pnpm install finished ${JSON.stringify({ exitCode })}`,
    );
    if (exitCode !== 0) {
      yield* logs.log(
        "boot",
        `5/6 pnpm install FAILED ${JSON.stringify({ exitCode })}`,
      );
      return yield* Effect.fail(
        new Error(`pnpm install failed with exit code ${exitCode}`),
      );
    }

    yield* logs.log("boot", "6/6 Boot complete, returning handle");

    // Pre-warm tsx: spawn no-op run so first Play has warmer process/tsx state
    yield* Effect.fork(
      Effect.gen(function* () {
        const proc = yield* Effect.promise(() =>
          container.spawn("pnpm", ["exec", "tsx", "-e", "console.log('ok')"], {
            output: false,
          }),
        );
        yield* Effect.promise(() => proc.exit);
      }),
    );

    const handle: WebContainerHandle = {
      writeFile: (path, content) =>
        Effect.promise(() => container.fs.writeFile(path, content)),
      readFile: (path) =>
        Effect.tryPromise({
          try: () => container.fs.readFile(path),
          catch: (e) => new Error(`Failed to read ${path}: ${e}`),
        }),
      readDirectory: (path) =>
        Effect.tryPromise({
          try: () =>
            container.fs
              .readdir(path, { withFileTypes: true })
              .then((entries) =>
                entries.map((e) => ({
                  name: e.name,
                  isDirectory: () => e.isDirectory(),
                })),
              ),
          catch: (e) => new Error(`Failed to readdir ${path}: ${e}`),
        }),
      spawn: (command, args, options) =>
        Effect.promise(() => container.spawn(command, args, options ?? {})),
    };

    return handle;
  }),
);
