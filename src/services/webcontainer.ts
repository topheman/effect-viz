/**
 * WebContainer Effect Service.
 *
 * Boots a single WebContainer instance, mounts the inner project template,
 * runs pnpm install, and provides writeFile/spawn/run.
 */
import { WebContainer as WC, type FileSystemTree } from "@webcontainer/api";
import { Context, Data, Effect, Layer, Semaphore } from "effect";

import {
  initEsbuildWasm,
  transpileForContainer,
} from "@/lib/transpileForContainer";
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
    "effect": "${__EFFECT_VERSION__}",
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

export const rootEffect = Effect.succeed("Hello from WebContainer!");
export const requirements = [];
`;

const ROOT_EFFECT_MISSING_MSG = `Error: Your program must export "rootEffect" (the Effect to run).
You can optionally export "requirements" (array of Layer) for custom services.

Example:
  export const rootEffect = Effect.succeed("Hello!");
  export const requirements = [];
`;

/** Runner: imports program.js, injects trace layer, runs. Fixed bootstrap — no user code transformation for tracing. */
const RUNNER_JS = `import { Effect } from "effect";
import { _withViz, _runProgramFork, _VirtualClock, _installDateShim, _GatedScheduler, _Stepper, _applyCommand, _decodeCommand, _encodeReply, _makeLineReader, _makeOriginTagger } from "./runtime.js";

const ROOT_EFFECT_MISSING_MSG = ${JSON.stringify(ROOT_EFFECT_MISSING_MSG)};

/** Virtual ms per wall ms. 1 is real time, 0.5 half speed, 0 frozen. */
function readRate() {
  const parsed = Number.parseFloat(process.env.VIZ_RATE ?? "1");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

/** Step from idle starts a run already gated, so its first events can be stepped. */
function readStartPaused() {
  return process.env.VIZ_START_PAUSED === "1";
}

async function main() {
  const virtualClock = new _VirtualClock({ rate: readRate() });

  // Install before importing program.js, so the user's module sees virtual time
  // from its first statement — a module evaluated earlier would capture the real
  // Date. The clock itself is unaffected either way: it reads wall time from
  // performance, which is never shimmed.
  _installDateShim(virtualClock);

  const mod = await import("./program.js");
  const rootEffect = mod.rootEffect;
  const requirements = mod.requirements ?? [];

  if (rootEffect == null) {
    process.stderr.write(ROOT_EFFECT_MISSING_MSG + "\\n");
    process.exit(1);
  }

  const startPaused = readStartPaused();
  const scheduler = new _GatedScheduler();
  let rootFiber = null;
  const stepper = new _Stepper({
    scheduler,
    clock: virtualClock,
    isFinished: () => rootFiber !== null && rootFiber.pollUnsafe() !== undefined,
  });

  // A paused start injects a yield the program never wrote; the tagger marks the
  // suspend and resume it produces so the log can offer to hide them.
  const tagOrigin = _makeOriginTagger({ startPaused });
  const onEmit = event => {
    process.stdout.write("TRACE_EVENT:" + JSON.stringify(tagOrigin(event)) + "\\n");
    stepper.noteEvent(); // A step runs until this moves
  };

  // Commands in on stdin, replies out on stdout. The listener doubles as the
  // process's keep-alive: a paused program has no task running and no timer
  // armed, so nothing else would hold the event loop open.
  const readStdin = _makeLineReader(line => {
    const command = _decodeCommand(line);
    if (command === null) return;
    const reply = _applyCommand(command, { stepper, clock: virtualClock });
    process.stdout.write(_encodeReply(reply));
  });
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", readStdin);

  // Gate before the program is forked, so even its first operation is held.
  if (startPaused) stepper.pause();

  // A paused gate already holds the root before its first operation. The
  // leading yield gives a paused start a suspend and resume pair, which the
  // log tags as the tool's and can hide.
  const body = startPaused ? Effect.andThen(Effect.yieldNow, rootEffect) : rootEffect;
  const program = _withViz(body, { onEmit, clock: virtualClock, scheduler, layers: requirements });

  process.stdout.write(_encodeReply({ reply: "ready", virtualNow: virtualClock.now() }));

  const { fiber, promise } = _runProgramFork(program);
  rootFiber = fiber;
  promise.then(
    (result) => console.log("Program completed:", result),
    (error) => console.error("Program failed:", error),
  ).finally(() => {
    // Nothing left to control, so let the event loop drain and the process exit.
    process.stdin.off("data", readStdin);
    process.stdin.pause();
  });
}
main();
`;

/** Minimal program for pre-warm: loads effect and the runtime, and runs one fiber. */
const PREWARM_PROGRAM = `import { Effect } from "effect";
import { _runProgramFork } from "./runtime.js";
const program = Effect.succeed("prewarm");
const { promise } = _runProgramFork(program);
promise.then(() => {}, (error) => console.error("Warmup program failed:", error));
`;

// ---
// Semaphore: only one WebContainer at a time
// ---

const SEMAPHORE_KEY = Symbol.for("app/WebContainer/semaphore");

/** Kept on `globalThis`, so a module reloaded by HMR shares the permit with the old one. */
const semaphore = ((globalThis as Record<symbol, unknown>)[SEMAPHORE_KEY] ??=
  Semaphore.makeUnsafe(1)) as Semaphore.Semaphore;

// ---
// Errors
// ---

/** Booting the container failed: runtime.js could not be fetched or pnpm install failed. */
export class WebContainerBootError extends Data.TaggedError(
  "WebContainerBootError",
)<{ readonly message: string; readonly cause?: unknown }> {}

/** A read on the container's file system failed. */
export class WebContainerFsError extends Data.TaggedError(
  "WebContainerFsError",
)<{
  readonly message: string;
  readonly path: string;
  readonly cause: unknown;
}> {}

// ---
// Service definition
// ---

export interface WebContainerHandle {
  readonly writeFile: (path: string, content: string) => Effect.Effect<void>;
  readonly readFile: (
    path: string,
  ) => Effect.Effect<Uint8Array, WebContainerFsError>;
  readonly readDirectory: (
    path: string,
  ) => Effect.Effect<
    Array<{ name: string; isDirectory: () => boolean }>,
    WebContainerFsError
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
  Context.Service<WebContainerHandle>("app/WebContainer");

function filesToTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [path, content] of Object.entries(files)) {
    tree[path] = { file: { contents: content } };
  }
  return tree;
}

/**
 * WebContainer Layer - scoped, single instance.
 * Boots container, mounts template, runs pnpm install.
 * Requires WebContainerLogs to be provided (e.g. via Layer.merge).
 */
export const WebContainerLive = Layer.effect(
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

    yield* logs.log("boot", "3/6 Fetching runtime.js...");
    const runtimeJs = yield* Effect.tryPromise({
      try: () => fetch("/app/runtime.js").then((r) => r.text()),
      catch: (cause) =>
        new WebContainerBootError({
          message: `Failed to fetch runtime.js: ${String(cause)}`,
          cause,
        }),
    });
    yield* logs.log(
      "boot",
      `3/6 runtime.js fetched ${JSON.stringify({ length: runtimeJs.length })}`,
    );

    yield* logs.log("boot", "3b/6 Initializing esbuild-wasm...");
    yield* Effect.promise(() => initEsbuildWasm());
    yield* logs.log("boot", "3b/6 Transpiling initial program.js...");
    const initialJs = yield* Effect.promise(() =>
      transpileForContainer(INITIAL_PROGRAM),
    );

    const files: Record<string, string> = {
      "package.json": PACKAGE_JSON,
      "tsconfig.json": TSCONFIG_JSON,
      "runtime.js": runtimeJs,
      "program.ts": INITIAL_PROGRAM,
      "program.js": initialJs,
      "runner.js": RUNNER_JS,
      "prewarm.ts": PREWARM_PROGRAM,
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
      return yield* new WebContainerBootError({
        message: `pnpm install failed with exit code ${exitCode}`,
      });
    }

    yield* logs.log("boot", "6/6 Boot complete, returning handle");

    // Pre-warm traced path: run minimal traced Effect so first Play has warmer tsx/Effect/runtime
    yield* Effect.forkChild(
      Effect.gen(function* () {
        const proc = yield* Effect.promise(() =>
          container.spawn("pnpm", ["exec", "tsx", "prewarm.ts"], {
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
          catch: (cause) =>
            new WebContainerFsError({
              message: `Failed to read ${path}: ${String(cause)}`,
              path,
              cause,
            }),
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
          catch: (cause) =>
            new WebContainerFsError({
              message: `Failed to readdir ${path}: ${String(cause)}`,
              path,
              cause,
            }),
        }),
      spawn: (command, args, options) =>
        Effect.promise(() => container.spawn(command, args, options ?? {})),
    };

    return handle;
  }),
);
