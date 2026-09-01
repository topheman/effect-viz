export type PlaybackState =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "finished";

/**
 * Why execution is paused. Only a user pause can be stepped: `stuck` means
 * nothing is runnable and no deadline is pending, so a step would do nothing.
 *
 * A stuck program is either deadlocked or waiting on something outside. Telling
 * those apart needs a fiber's status, which is itself an Effect and so needs the
 * scheduler that a pause is holding.
 */
export type PauseReason = "user" | "stuck";

export interface PlaybackAvailability {
  canPlay: boolean;
  canPause: boolean;
  canStep: boolean;
  canReset: boolean;
  canChangeSpeed: boolean;
}

/**
 * Which controls the current playback state allows. It lives apart from
 * `PlaybackControls` because the keyboard shortcuts in `MainLayout` have to obey
 * exactly the same rules as the buttons — a shortcut that outran them could
 * start a run the Reset button cannot reach.
 */
export function getPlaybackAvailability({
  state,
  pauseReason,
  isPlayDisabled,
}: {
  state: PlaybackState;
  pauseReason: PauseReason;
  isPlayDisabled: boolean;
}): PlaybackAvailability {
  return {
    // Play doubles as resume (from paused) and re-run (from finished).
    canPlay:
      (state === "idle" || state === "paused" || state === "finished") &&
      !isPlayDisabled,
    canPause: state === "running",
    // Step from a stopped program starts it already gated, so its very first
    // events can be stepped through; like Play, that includes re-running one
    // that has finished. Otherwise stepping needs a live, frozen program, and a
    // stuck pause has nothing the runtime could release.
    canStep:
      ((state === "idle" || state === "finished") && !isPlayDisabled) ||
      (state === "paused" && pauseReason === "user"),
    // Nothing to reset before the first run.
    canReset: state !== "idle",
    // Speed is live in every state: a stopped program is re-run at the new rate,
    // a live one is retuned in place.
    canChangeSpeed: true,
  };
}
