import { Duration, Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { WebContainer, type WebContainerHandle } from "@/services/webcontainer";
import type { TraceEvent } from "@/types/trace";

import {
  ROOT_END_GRACE,
  STDOUT_DRAIN_CAP,
  spawnAndParseTraceEvents,
} from "./spawnAndParse";

type Process = Effect.Success<ReturnType<WebContainerHandle["spawn"]>>;

// The service's module initialises esbuild-wasm, which throws under jsdom.
vi.mock("@/lib/transpileForContainer", () => ({
  initEsbuildWasm: () => Promise.resolve(),
  transpileForContainer: (source: string) => source,
}));

const cap = Duration.toMillis(STDOUT_DRAIN_CAP);
const grace = Duration.toMillis(ROOT_END_GRACE);

const line = (event: object) => `TRACE_EVENT:${JSON.stringify(event)}\n`;
const rootFork = line({ type: "fiber:fork", fiberId: "#1", label: "root" });
const childFork = line({
  type: "fiber:fork",
  fiberId: "#2",
  parentId: "#1",
  label: "child",
});
const orphanFork = line({ type: "fiber:fork", fiberId: "#9", label: "orphan" });
const rootEnd = line({ type: "fiber:end", fiberId: "#1", result: "success" });
const rootInterrupt = line({ type: "fiber:interrupt", fiberId: "#1" });

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A process whose exit resolves at once, then writes each batch of lines to
 * stdout at its delay, and closes stdout at `closeAt` when given.
 */
function lateProcess(
  batches: ReadonlyArray<readonly [number, string[]]>,
  closeAt?: number,
) {
  let output!: ReadableStreamDefaultController<string>;
  const proc = {
    output: new ReadableStream<string>({ start: (c) => void (output = c) }),
    input: new WritableStream<string>(),
    exit: Promise.resolve(0),
    kill: () => {},
  } as unknown as Process;
  for (const [at, lines] of batches) {
    void delay(at).then(() => lines.forEach((l) => output.enqueue(l)));
  }
  if (closeAt !== undefined) void delay(closeAt).then(() => output.close());
  return proc;
}

/** Runs the effect against `proc`; returns the parsed events, the other stdout lines and the elapsed ms. */
async function run(proc: Process) {
  const events: TraceEvent[] = [];
  const stdout: string[] = [];
  const handle = { spawn: () => Effect.succeed(proc) };
  const started = performance.now();
  await Effect.runPromise(
    Effect.scoped(
      spawnAndParseTraceEvents({
        callbacks: { addEvent: (e) => events.push(e), processEvent: () => {} },
        onFirstChunk: () => {},
        onStdout: (l) => stdout.push(l),
        rate: 1,
      }),
    ).pipe(
      Effect.provideService(
        WebContainer,
        handle as unknown as WebContainerHandle,
      ),
    ),
  );
  return { events, stdout, elapsed: performance.now() - started };
}

describe("spawnAndParseTraceEvents", () => {
  it("parses events that reach stdout after the process exits", async () => {
    const { events } = await run(
      lateProcess([[400, [rootFork, childFork]]], 400),
    );
    expect(events.map((e) => e.fiberId)).toEqual(["#1", "#2"]);
  });

  it("keeps the output that follows the root's end", async () => {
    const { stdout } = await run(
      lateProcess(
        [
          [400, [rootFork, rootEnd]],
          [400 + grace / 2, ["Program completed: 42\n"]],
        ],
        400 + grace / 2,
      ),
    );
    expect(stdout).toEqual(["Program completed: 42"]);
  });

  it.each([
    ["fiber:end", rootEnd],
    ["fiber:interrupt", rootInterrupt],
  ])("finishes on the root's %s when stdout never closes", async (_, end) => {
    const { events, elapsed } = await run(
      lateProcess([[400, [rootFork, end]]]),
    );
    expect(events).toHaveLength(2);
    expect(elapsed).toBeLessThan(cap);
  });

  it("keeps the first parentless fork as the root", async () => {
    const { elapsed } = await run(
      lateProcess([[400, [rootFork, orphanFork, rootEnd]]]),
    );
    expect(elapsed).toBeLessThan(cap);
  });

  it("gives up after the cap when stdout never closes", async () => {
    const { events, elapsed } = await run(lateProcess([[400, [childFork]]]));
    expect(events).toHaveLength(1);
    expect(elapsed).toBeGreaterThanOrEqual(cap - 5);
  });
});
