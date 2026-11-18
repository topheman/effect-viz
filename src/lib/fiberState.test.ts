import { describe, expect, it } from "vite-plus/test";

import { endState, isEnded } from "./fiberState";

describe("endState", () => {
  it("tells a success, a failure and an interruption apart", () => {
    const at = { fiberId: "#1", timestamp: 0 };
    expect(endState({ type: "fiber:end", result: "success", ...at })).toBe(
      "completed",
    );
    expect(endState({ type: "fiber:end", result: "failure", ...at })).toBe(
      "failed",
    );
    expect(endState({ type: "fiber:interrupt", ...at })).toBe("interrupted");
  });
});

describe("isEnded", () => {
  it("holds for every way a fiber ends, not while it lives", () => {
    expect(isEnded("completed")).toBe(true);
    expect(isEnded("failed")).toBe(true);
    expect(isEnded("interrupted")).toBe(true);
    expect(isEnded("running")).toBe(false);
    expect(isEnded("suspended")).toBe(false);
  });
});
