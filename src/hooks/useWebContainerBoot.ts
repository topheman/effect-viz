/**
 * Boots the WebContainer on mount and keeps it alive.
 * Exposes status, runPlay, and syncToContainer (debounced for edits).
 */
import { Effect, Fiber, Layer } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  spawnAndParseTraceEvents,
  type SpawnAndParseCallbacks,
} from "@/effects/spawnAndParse";
import { acquireMonacoTypes } from "@/effects/typeAcquisition";
import { transformForContainer } from "@/lib/transformForContainer";
import type { WebContainerHandle } from "@/services/webcontainer";
import { WebContainer, WebContainerLive } from "@/services/webcontainer";
import { makeWebContainerLogsLayer } from "@/services/webContainerLogs";
import { useWebContainerLogsStore } from "@/stores/webContainerLogsStore";

export type BootStatus = "idle" | "booting" | "ready" | "error";

export function useWebContainerBoot() {
  const { addLog } = useWebContainerLogsStore();
  const [status, setStatus] = useState<BootStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [typesReady, setTypesReady] = useState(false);
  const handleRef = useRef<WebContainerHandle | null>(null);
  const bootFiberRef = useRef<Fiber.RuntimeFiber<void, unknown> | null>(null);
  const playFiberRef = useRef<Fiber.RuntimeFiber<unknown, unknown> | null>(
    null,
  );

  useEffect(() => {
    setStatus("booting");
    setError(null);
    addLog("boot", "Boot effect starting...");
    console.log("[useWebContainerBoot] Boot started");

    const webContainerLogsLayer = makeWebContainerLogsLayer(addLog);
    const bootEffect = Effect.gen(function* () {
      const handle = yield* WebContainer;
      handleRef.current = handle;
      setStatus("ready");
      addLog("boot", "Boot complete, ready");
      console.log("[useWebContainerBoot] Boot complete, status=ready");
      addLog("boot", "Acquiring Monaco types...");
      yield* acquireMonacoTypes.pipe(
        Effect.tap(() => Effect.sync(() => addLog("boot", "Types acquired"))),
        Effect.tap(() => Effect.sync(() => setTypesReady(true))),
      );
      yield* Effect.never;
    }).pipe(
      Effect.provide(Layer.provide(WebContainerLive, webContainerLogsLayer)),
      Effect.scoped,
      Effect.tapError((err) =>
        Effect.sync(() => {
          const msg = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : "Error";
          addLog("boot", `Boot failed: ${name}: ${msg}`);
          // Log full details for debugging (DataCloneError on iOS, etc.)
          console.error("[useWebContainerBoot] Boot failed", {
            name,
            message: msg,
            stack: err instanceof Error ? err.stack : undefined,
            err,
          });
          setStatus("error");
          setError(msg);
        }),
      ),
    );

    // runFork starts the effect as root fiber (async-safe). runPromise(fork(...))
    // would let the parent complete and interrupt the child before it runs.
    const fiber = Effect.runFork(bootEffect);
    bootFiberRef.current = fiber;

    return () => {
      if (bootFiberRef.current) {
        Effect.runPromise(Fiber.interrupt(bootFiberRef.current));
        bootFiberRef.current = null;
      }
      handleRef.current = null;
      setStatus("idle");
    };
  }, [addLog]);

  const runPlay = useCallback(
    (
      callbacks: SpawnAndParseCallbacks,
    ): Promise<{ success: boolean; exitCode?: number }> => {
      const handle = handleRef.current;
      if (!handle || status !== "ready") {
        return Promise.resolve({ success: false });
      }

      // Provide the existing handle so spawnAndParseTraceEvents gets WebContainer without booting again
      const layer = Layer.succeed(WebContainer, handle);
      const program = Effect.scoped(
        spawnAndParseTraceEvents(callbacks).pipe(Effect.provide(layer)),
      );
      const playFiber = Effect.runSync(Effect.scoped(Effect.fork(program)));
      playFiberRef.current = playFiber;

      return Effect.runPromise(
        Fiber.join(playFiber).pipe(
          Effect.map((exitCode) => {
            playFiberRef.current = null;
            return { success: exitCode === 0, exitCode };
          }),
          Effect.catchAll((err) => {
            playFiberRef.current = null;
            return Effect.succeed({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }),
        ),
      );
    },
    [status],
  );

  const interruptPlay = useCallback(() => {
    if (playFiberRef.current) {
      Effect.runPromise(Fiber.interrupt(playFiberRef.current));
      playFiberRef.current = null;
    }
  }, []);

  const syncToContainer = useCallback((content: string) => {
    const handle = handleRef.current;
    if (!handle) return;
    const transformed = transformForContainer(content);
    Effect.runPromise(handle.writeFile("program.ts", transformed));
  }, []);

  const debouncedSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncToContainerDebounced = useCallback(
    (content: string) => {
      if (debouncedSyncRef.current) clearTimeout(debouncedSyncRef.current);
      debouncedSyncRef.current = setTimeout(() => {
        debouncedSyncRef.current = null;
        syncToContainer(content);
      }, 2000);
    },
    [syncToContainer],
  );

  return {
    status,
    error,
    typesReady,
    runPlay,
    interruptPlay,
    syncToContainer,
    syncToContainerDebounced,
    isReady: status === "ready",
  };
}
