import {
  getPlaybackAvailability,
  type PauseReason,
  type PlaybackState,
} from "./playbackAvailability";

function availability(
  state: PlaybackState,
  {
    pauseReason = "user",
    isPlayDisabled = false,
  }: { pauseReason?: PauseReason; isPlayDisabled?: boolean } = {},
) {
  return getPlaybackAvailability({ state, pauseReason, isPlayDisabled });
}

/**
 * These rules are read by the buttons and by the keyboard shortcuts, so they are
 * pinned here rather than left to whichever caller is being changed.
 */
describe("getPlaybackAvailability", () => {
  it("offers Play from every stopped or paused state", () => {
    expect(availability("idle").canPlay).toBe(true);
    expect(availability("paused").canPlay).toBe(true);
    expect(availability("finished").canPlay).toBe(true);
    expect(availability("running").canPlay).toBe(false);
    expect(availability("starting").canPlay).toBe(false);
  });

  it("withholds Play and Step while the container is unavailable", () => {
    const booting = { isPlayDisabled: true };
    expect(availability("idle", booting).canPlay).toBe(false);
    expect(availability("idle", booting).canStep).toBe(false);
    expect(availability("finished", booting).canStep).toBe(false);
  });

  it("steps a stopped program, which starts it gated", () => {
    expect(availability("idle").canStep).toBe(true);
    expect(availability("finished").canStep).toBe(true);
  });

  it("steps a paused program only while the pause is the user's", () => {
    expect(availability("paused", { pauseReason: "user" }).canStep).toBe(true);
    // Nothing is runnable, so a step would release nothing.
    expect(availability("paused", { pauseReason: "stuck" }).canStep).toBe(
      false,
    );
  });

  it("never steps a program that is free-running or still starting", () => {
    expect(availability("running").canStep).toBe(false);
    expect(availability("starting").canStep).toBe(false);
  });

  it("pauses only a running program", () => {
    expect(availability("running").canPause).toBe(true);
    expect(availability("paused").canPause).toBe(false);
    expect(availability("idle").canPause).toBe(false);
  });

  it("has nothing to reset before the first run", () => {
    expect(availability("idle").canReset).toBe(false);
    expect(availability("running").canReset).toBe(true);
    expect(availability("finished").canReset).toBe(true);
  });

  it("fixes the rate for the life of a run", () => {
    expect(availability("idle").canChangeSpeed).toBe(true);
    expect(availability("paused").canChangeSpeed).toBe(true);
    expect(availability("finished").canChangeSpeed).toBe(true);
    expect(availability("running").canChangeSpeed).toBe(false);
    expect(availability("starting").canChangeSpeed).toBe(false);
  });
});
