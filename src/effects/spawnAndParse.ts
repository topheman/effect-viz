/**
 * Effect that spawns `pnpm exec tsx program.ts` in the WebContainer and parses
 * TRACE_EVENT: lines from stdout, pushing to addEvent and processEvent.
 */
import { Duration, Effect, Option, Ref, Stream } from "effect";

import { WebContainer } from "@/services/webcontainer";
import type { TraceEvent } from "@/types/trace";

const TRACE_EVENT_PREFIX = "TRACE_EVENT:";

/** Enable with ?perf=1 in URL or sessionStorage.setItem('perf_play','1'). */
function isPerfPlayEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("perf") === "1" ||
    sessionStorage.getItem("perf_play") === "1"
  );
}

function makeLogPerf(
  perfEnabled: boolean,
): (label: string, t0: number, t1?: number) => void {
  return (label, t0, t1) => {
    if (!perfEnabled) return;
    const elapsed = t1 !== undefined ? `${(t1 - t0).toFixed(0)}ms` : "start";
    console.log(`[perf-play] ${label}: ${elapsed}`);
  };
}

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
 * Spawn pnpm exec tsx program.ts, parse TRACE_EVENT lines from stdout,
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
    const logPerf = makeLogPerf(isPerfPlayEnabled());

    const t0 = performance.now();
    logPerf("t0 (before spawn)", t0);

    const proc = yield* Effect.acquireRelease(
      wc.spawn("pnpm", ["exec", "tsx", "program.ts"], { output: true }),
      (p) => Effect.sync(() => p.kill()),
    );

    const t1 = performance.now();
    logPerf("t1 (spawn returned)", t0, t1);
    logPerf("t0→t1 spawn overhead", t0, t1);

    const firstChunkSeenRef = yield* Ref.make(false);
    const t2Ref = yield* Ref.make<number | null>(null);
    const rawStream = Stream.fromReadableStream(
      () => proc.output,
      (err) => err as Error,
    ).pipe(
      // performance timings
      Stream.tap(() =>
        Ref.getAndSet(firstChunkSeenRef, true).pipe(
          Effect.flatMap((seen) =>
            seen
              ? Effect.void
              : Effect.gen(function* () {
                  const t2 = performance.now();
                  yield* Ref.set(t2Ref, t2);
                  logPerf("t2 (first stdout chunk)", t0, t2);
                  logPerf("t1→t2 npx/tsx/exec", t1, t2);
                }),
          ),
        ),
      ),
    );

    const traceStream = rawStream.pipe(
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
          if (!wasFirst) {
            // performance timings
            const t3 = performance.now();
            const t2 = yield* Ref.get(t2Ref);
            logPerf("t3 (first TRACE_EVENT parsed)", t0, t3);
            if (t2 !== null) logPerf("t2→t3 parse (negligible)", t2, t3);
            logPerf("t0→t3 total (Play → first event)", t0, t3);

            // impl
            yield* Effect.sync(onFirstChunk);
          }
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
