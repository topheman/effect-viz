/**
 * Effect that spawns `npx tsx program.ts` in the WebContainer and parses
 * TRACE_EVENT: lines from stdout, pushing to addEvent and processEvent.
 */
import { Duration, Effect, Option, Ref, Stream } from "effect";

import { WebContainer } from "@/services/webcontainer";
import type { TraceEvent } from "@/types/trace";

const TRACE_EVENT_PREFIX = "TRACE_EVENT:";

function parseTraceEvent(line: string): TraceEvent | null {
  if (!line.startsWith(TRACE_EVENT_PREFIX)) return null;
  try {
    const json = line.slice(TRACE_EVENT_PREFIX.length).trim();
    if (!json) return null;
    const parsed = JSON.parse(json) as TraceEvent;
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export interface SpawnAndParseCallbacks {
  addEvent: (event: TraceEvent) => void;
  processEvent: (event: TraceEvent) => void;
}

/**
 * Spawn npx tsx program.ts, parse TRACE_EVENT lines from stdout,
 * and push to the provided callbacks.
 *
 * Returns when the process exits (proc.exit). The stream consumer runs
 * in parallel to process events; we don't wait for the stream to close
 * because WebContainer's output stream may not reliably close on exit.
 *
 * The process is killed when the Effect scope closes (e.g. on Reset).
 */
export function spawnAndParseTraceEvents({
  callbacks,
  onFirstChunk,
}: {
  callbacks: SpawnAndParseCallbacks;
  onFirstChunk: () => void;
}) {
  return Effect.gen(function* () {
    const wc = yield* WebContainer;
    const proc = yield* Effect.acquireRelease(
      wc.spawn("npx", ["tsx", "program.ts"], { output: true }),
      (p) => Effect.sync(() => p.kill()),
    );

    const traceStream = Stream.fromReadableStream(
      () => proc.output,
      (err) => err as Error,
    ).pipe(
      Stream.mapConcat((chunk) => chunk.split("\n")),
      Stream.filterMap((line) => Option.fromNullable(parseTraceEvent(line))),
    );

    const firstChunkCalledRef = yield* Ref.make(false);
    // Run stream consumer in background; don't block on stream EOF.
    // WebContainer's output stream may not close when process exits.
    yield* Effect.fork(
      Stream.runForEach(traceStream, (event) =>
        Effect.gen(function* () {
          const wasFirst = yield* Ref.getAndSet(firstChunkCalledRef, true);
          if (!wasFirst) yield* Effect.sync(onFirstChunk);
          yield* Effect.sync(() => {
            callbacks.addEvent(event);
            callbacks.processEvent(event);
          });
        }),
      ),
    );

    const exitCode = yield* Effect.promise(() => proc.exit);
    // Brief delay so the stream consumer can process the last events (e.g. fiber:end #0)
    // before scope close interrupts it. Without this, Multi-Step Worker etc. miss the root end.
    yield* Effect.sleep(Duration.millis(150));
    return exitCode;
  });
}
