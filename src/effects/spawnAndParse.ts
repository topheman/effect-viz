/**
 * Effect that spawns `npx tsx program.ts` in the WebContainer and parses
 * TRACE_EVENT: lines from stdout, pushing to addEvent and processEvent.
 */
import { Effect, Option, Stream } from "effect";

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
 * The process is killed when the Effect scope closes (e.g. on Reset).
 */
export function spawnAndParseTraceEvents(callbacks: SpawnAndParseCallbacks) {
  return Effect.gen(function* () {
    const wc = yield* WebContainer;
    const proc = yield* Effect.acquireRelease(
      wc.spawn("npx", ["tsx", "program.ts"], { output: true }),
      (p) => Effect.sync(() => p.kill()),
    );

    const traceStream = Stream.fromReadableStream(
      () => proc.output,
      (chunk) => chunk,
    ).pipe(
      Stream.mapConcat((chunk) => chunk.split("\n")),
      Stream.filterMap((line) => Option.fromNullable(parseTraceEvent(line))),
    );
    yield* Stream.runForEach(traceStream, (event) =>
      Effect.sync(() => {
        callbacks.addEvent(event);
        callbacks.processEvent(event);
      }),
    );

    return yield* Effect.promise(() => proc.exit);
  });
}
