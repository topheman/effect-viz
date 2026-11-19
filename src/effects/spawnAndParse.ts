/**
 * Effect that spawns `node --enable-source-maps runner.js` in the WebContainer and parses
 * TRACE_EVENT: lines from stdout. The runner imports program.js (rootEffect, requirements)
 * and injects the trace layer before running.
 */
import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Ref,
  Stream,
} from "effect";

import {
  CONTROL_REPLY_PREFIX,
  type ControlCommand,
  type ControlReply,
  decodeCommand,
  decodeReply,
  encodeCommand,
} from "@/runtime/controlChannel";
import { WebContainer } from "@/services/webcontainer";
import type { TraceEvent, TraceOrigin } from "@/types/trace";

const TRACE_EVENT_PREFIX = "TRACE_EVENT:";
const PERF_PREFIX = "PERF:";

/** Longest wait for the rest of stdout once the process has exited. */
export const STDOUT_DRAIN_CAP = Duration.seconds(1);

/** Wait after the root's end for the runner's last lines, unless stdout ends first. */
export const ROOT_END_GRACE = Duration.millis(150);

/**
 * Enable with ?perf=1 in URL or sessionStorage.setItem('perf_play','1').
 * When enabled: host logs t0–t3; container logs [container] ready (ms until Effect.runFork).
 */
export function isPerfPlayEnabled(): boolean {
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
 * Whoever drives pause, resume and step for this process. Held for the life of
 * the process: `attach` when its stdin is writable, `detach` when it is gone, so
 * a click landing between runs is dropped rather than sent into a dead pipe.
 */
export interface ControlSink {
  attach: (send: (command: ControlCommand) => void) => void;
  handleReply: (reply: ControlReply) => void;
  detach: () => void;
}

/**
 * Spawn `node runner.js`, parse TRACE_EVENT lines from stdout,
 * and push to the provided callbacks.
 *
 * Returns once the process has exited and its stdout is drained: the stream
 * has ended, or `ROOT_END_GRACE` has passed since the root fiber's end was
 * parsed, within `STDOUT_DRAIN_CAP`.
 *
 * The process is killed when the Effect scope closes (e.g. on Reset).
 */
export function spawnAndParseTraceEvents({
  callbacks,
  onFirstChunk,
  onStdout,
  rate,
  startPaused = false,
  control,
}: {
  callbacks: SpawnAndParseCallbacks;
  onFirstChunk: () => void;
  onStdout?: (line: string, origin: TraceOrigin) => void;
  /** Virtual ms per wall ms, read by runner.js. Fixed for the life of the process. */
  rate: number;
  /** Gate the runtime before the program runs, so its first step is the user's. */
  startPaused?: boolean;
  control?: ControlSink;
}) {
  return Effect.gen(function* () {
    const wc = yield* WebContainer;
    const logPerf = makeLogPerf(isPerfPlayEnabled());

    const t0 = performance.now();
    logPerf("t0 (before spawn)", t0);

    const spawnOptions = {
      output: true as const,
      env: {
        VIZ_RATE: String(rate),
        ...(startPaused && { VIZ_START_PAUSED: "1" }),
        ...(isPerfPlayEnabled() && { PERF_PLAY: "1" }),
      },
    };
    const proc = yield* Effect.acquireRelease(
      wc.spawn("node", ["--enable-source-maps", "runner.js"], spawnOptions),
      (p) => Effect.sync(() => p.kill()),
    );

    if (control !== undefined) {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const writer = proc.input.getWriter();
          control.attach((command) => {
            // A command racing the end of a run finds a closed pipe. There is
            // nothing to do about it: the run it was meant for is over.
            void writer.write(encodeCommand(command)).catch(() => {});
          });
          return writer;
        }),
        (writer) =>
          Effect.sync(() => {
            control.detach();
            try {
              writer.releaseLock();
            } catch {
              // The stream went with the process; the lock went with it.
            }
          }),
      );
    }

    const t1 = performance.now();
    logPerf("t1 (spawn returned)", t0, t1);
    logPerf("t0→t1 spawn overhead", t0, t1);

    const firstChunkSeenRef = yield* Ref.make(false);
    const t2Ref = yield* Ref.make<number | null>(null);
    // Release the reader rather than cancel it. By default an interrupted
    // stream calls `reader.cancel()`, which errors WebContainer's own output
    // stream, and the `kill()` that follows makes it close that errored stream:
    // an uncaught TypeError on every Reset or program switch mid-run.
    const rawStream = Stream.fromReadableStream({
      evaluate: () => proc.output,
      onError: (err) => err as Error,
      releaseLockOnEnd: true,
    }).pipe(
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
                  logPerf("t1→t2 node runner.js", t1, t2);
                }),
          ),
        ),
      ),
    );

    const lineStream = rawStream.pipe(
      Stream.map((chunk) => chunk.split("\n")),
      Stream.flattenIterable,
    );
    const traceStream = lineStream.pipe(
      Stream.tap((line) =>
        Effect.sync(() => {
          if (line.startsWith(PERF_PREFIX)) {
            const rest = line.slice(PERF_PREFIX.length).trim();
            const spaceIdx = rest.indexOf(" ");
            const label = spaceIdx >= 0 ? rest.slice(0, spaceIdx) : rest;
            const ts = spaceIdx >= 0 ? rest.slice(spaceIdx + 1).trim() : "";
            const t1 = ts ? Number.parseFloat(ts) : undefined;
            if (t1 !== undefined && !Number.isNaN(t1)) {
              logPerf(`[container] ${label}`, 0, t1);
            }
            return;
          }
          if (line.startsWith(CONTROL_REPLY_PREFIX)) {
            const reply = decodeReply(line);
            if (reply !== null) control?.handleReply(reply);
            return;
          }
          // Every process gets a pseudoterminal, and a terminal echoes what is
          // written to it, so each command we send comes straight back here.
          // Nothing else writes to this stdin, so a line that decodes as a
          // command is one of ours rather than the program's output.
          if (decodeCommand(line) !== null) {
            onStdout?.(line, "tool");
            return;
          }
          // Anything left that is not a trace event comes from something else
          // writing to stdout inside the container (Node errors, stack traces,
          // the program's own console.log).
          if (line.startsWith(TRACE_EVENT_PREFIX) || line.trim() === "") return;
          onStdout?.(line, "program");
        }),
      ),
      Stream.map(parseTraceEvent),
      Stream.filter((event): event is TraceEvent => event !== null),
    );

    const firstChunkCalledRef = yield* Ref.make(false);
    const rootIdRef = yield* Ref.make<string | null>(null);
    const rootEnded = yield* Deferred.make<void>();
    const consumer = yield* Effect.forkChild(
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
          if (event.type === "fiber:fork" && event.parentId === undefined) {
            // The tracer also emits a parentless fork for a fiber it finds
            // with no forker; the root is the first one.
            yield* Ref.update(rootIdRef, (id) => id ?? event.fiberId);
          } else if (
            (event.type === "fiber:end" || event.type === "fiber:interrupt") &&
            event.fiberId === (yield* Ref.get(rootIdRef))
          ) {
            yield* Deferred.succeed(rootEnded, undefined);
          }
        }),
      ),
    );

    const exitCode = yield* Effect.promise(() => proc.exit);
    const tExit = performance.now();
    logPerf("exit", t0, tExit);
    // The exit notification and stdout reach the page on separate channels, so
    // the exit can arrive while stdout is still in flight. Keep reading until
    // the stream ends. The root fiber's end is a fallback for a stream that
    // does not close: structured concurrency settles the root's children before
    // it, so no trace event of its tree follows it, and the grace covers the
    // runner's result line written right after. The cap covers a stream that
    // never closes on a program whose root never ran.
    const drained = yield* Effect.raceFirst(
      Fiber.await(consumer).pipe(
        Effect.map((exit) =>
          Exit.isSuccess(exit) ? "stream end" : "stream error",
        ),
      ),
      Deferred.await(rootEnded).pipe(
        Effect.andThen(Effect.sleep(ROOT_END_GRACE)),
        Effect.as("root end"),
      ),
    ).pipe(Effect.timeoutOption(STDOUT_DRAIN_CAP));
    logPerf(
      `exit→drained (${Option.getOrElse(drained, () => "cap")})`,
      tExit,
      performance.now(),
    );
    return exitCode;
  });
}
