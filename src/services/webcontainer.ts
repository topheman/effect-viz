/**
 * WebContainer Effect Service.
 *
 * Boots a single WebContainer instance, mounts the inner project template,
 * runs npm install, and provides writeFile/spawn/run.
 *
 * Requires: npm install @webcontainer/api
 */
import { WebContainer as WC, type FileSystemTree } from "@webcontainer/api";
import { Context, Effect, GlobalValue, Layer } from "effect";

// ---
// Inner project template (mounted at container root)
// ---

const PACKAGE_JSON = `{
  "name": "effectviz-inner",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "npx tsx program.ts"
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
 */
export const WebContainerLive = Layer.scoped(
  WebContainer,
  Effect.gen(function* () {
    yield* Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1));
    const container = yield* Effect.acquireRelease(
      Effect.promise(() => WC.boot()),
      (c) => Effect.sync(() => c.teardown()),
    );

    const tracedRunnerJs = yield* Effect.tryPromise({
      try: () => fetch("/tracedRunner.js").then((r) => r.text()),
      catch: (e) => new Error(`Failed to fetch tracedRunner.js: ${e}`),
    });

    const files: Record<string, string> = {
      "package.json": PACKAGE_JSON,
      "tsconfig.json": TSCONFIG_JSON,
      "tracedRunner.js": tracedRunnerJs,
      "program.ts": INITIAL_PROGRAM,
    };

    yield* Effect.promise(() => container.mount(filesToTree(files)));

    const installProcess = yield* Effect.promise(() =>
      container.spawn("npm", ["install"], { output: true }),
    );
    const exitCode = yield* Effect.promise(() => installProcess.exit);
    if (exitCode !== 0) {
      return yield* Effect.fail(
        new Error(`npm install failed with exit code ${exitCode}`),
      );
    }

    const handle: WebContainerHandle = {
      writeFile: (path, content) =>
        Effect.promise(() => container.fs.writeFile(path, content)),
      spawn: (command, args, options) =>
        Effect.promise(() => container.spawn(command, args, options ?? {})),
    };

    return handle;
  }),
);
