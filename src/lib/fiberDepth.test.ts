import { describe, expect, it } from "vitest";

import type { TraceEvent } from "@/types/trace";

import { eventDepth, fiberDepths } from "./fiberDepth";

const fork = (
  fiberId: string,
  parentId?: string,
  forkedBy?: string,
): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  parentId,
  forkedBy,
  label: fiberId,
  timestamp: 0,
});

describe("fiberDepths", () => {
  it("follows parentId down from the root", () => {
    const depths = fiberDepths([
      fork("#0"),
      fork("#1", "#0"),
      fork("#2", "#1"),
      fork("#3", "#0"),
    ]);
    expect(Object.fromEntries(depths)).toEqual({
      "#0": 0,
      "#1": 1,
      "#2": 2,
      "#3": 1,
    });
  });

  it("treats a fiber whose parent was never recorded as a root", () => {
    expect(fiberDepths([fork("#5", "#4")]).get("#5")).toBe(0);
  });
});

describe("eventDepth", () => {
  const depths = fiberDepths([fork("#0"), fork("#1", "#0")]);

  it("draws a fork on the parent that performed it", () => {
    expect(eventDepth(fork("#0"), depths)).toBe(0);
    expect(eventDepth(fork("#1", "#0"), depths)).toBe(0);
  });

  it("draws a fork on the fiber that ran it when that is not the parent", () => {
    const workers = [
      fork("#0"),
      fork("#1", "#0", "#0"),
      fork("#2", "#0", "#1"),
    ];
    const depths = fiberDepths(workers);
    expect(depths.get("#2")).toBe(1);
    expect(eventDepth(workers[2], depths)).toBe(1);
  });

  it("draws other events on their own fiber", () => {
    expect(
      eventDepth({ type: "fiber:end", fiberId: "#1", timestamp: 0 }, depths),
    ).toBe(1);
  });
});
