import { Context, Effect, Layer } from "effect";

export interface WebContainerLogs {
  readonly log: (label: string, message: string) => Effect.Effect<void>;
}

export const WebContainerLogs = Context.GenericTag<WebContainerLogs>(
  "app/WebContainerLogs",
);

/**
 * Create a WebContainerLogs Layer that calls a callback function.
 * This bridges Effect's world with React's world.
 */
export const makeWebContainerLogsLayer = (
  onLog: (label: string, message: string) => void,
): Layer.Layer<WebContainerLogs> =>
  Layer.succeed(WebContainerLogs, {
    log: (label, message) => Effect.sync(() => onLog(label, message)),
  });
