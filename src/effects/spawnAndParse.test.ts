import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { WebContainer, type WebContainerHandle } from "@/services/webcontainer";
import type { TraceEvent } from "@/types/trace";

import { STDOUT_DRAIN_CAP, spawnAndParseTraceEvents } from "./spawnAndParse";

type Process = Effect.Success<ReturnType<WebContainerHandle["spawn"]>>;

// The service's module initialises esbuild-wasm, which throws under jsdom.
vi.mock("@/lib/transpileForContainer", () => ({
  initEsbuildWasm: () => Promise.resolve(),
  transpileForContainer: (source: string) => source,
}));

const line = (event: object) => `TRACE_EVENT:${JSON.stringify(event)}\n`;
const rootFork = line({ type: "fiber:fork", fiberId: "#1", label: "root" });
const childFork = line({
  type: "fiber:fork",
  fiberId: "#2",
  parentId: "#1",
  label: "child",
});
const rootEnd = line({ type: "fiber:end", fiberId: "#1", result: "success" });

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A process whose exit resolves first, then writes `lines` to stdout 200 ms later. */
function lateProcess(lines: string[], { close }: { close: boolean }) {
  let output!: ReadableStreamDefaultController<string>;
  const proc = {
    output: new ReadableStream<string>({ start: (c) => void (output = c) }),
    input: new WritableStream<string>(),
    exit: Promise.resolve(0),
    kill: () => {},
  } as unknown as Process;
  void delay(200).then(() => {
    for (const l of lines) output.enqueue(l);
    if (close) output.close();
  });
  return proc;
}

async function run(proc: Process) {
  const events: TraceEvent[] = [];
  const handle = { spawn: () => Effect.succeed(proc) };
  const started = performance.now();
  await Effect.runPromise(
    Effect.scoped(
      spawnAndParseTraceEvents({
        callbacks: { addEvent: (e) => events.push(e), processEvent: () => {} },
        onFirstChunk: () => {},
        rate: 1,
      }),
    ).pipe(
      Effect.provideService(
        WebContainer,
        handle as unknown as WebContainerHandle,
      ),
    ),
  );
  return { events, elapsed: performance.now() - started };
}

describe("spawnAndParseTraceEvents", () => {
  it("parses events that reach stdout after the process exits", async () => {
    const { events } = await run(
      lateProcess([rootFork, childFork], { close: true }),
    );
    expect(events.map((e) => e.fiberId)).toEqual(["#1", "#2"]);
  });

  it("finishes on the root's fiber:end when stdout never closes", async () => {
    const { events, elapsed } = await run(
      lateProcess([rootFork, rootEnd], { close: false }),
    );
    expect(events.map((e) => e.type)).toEqual(["fiber:fork", "fiber:end"]);
    expect(elapsed).toBeLessThan(STDOUT_DRAIN_CAP);
  });

  it("gives up after the cap when stdout never closes", async () => {
    const { events, elapsed } = await run(
      lateProcess([childFork], { close: false }),
    );
    expect(events).toHaveLength(1);
    expect(elapsed).toBeGreaterThanOrEqual(STDOUT_DRAIN_CAP - 10);
  });
});
