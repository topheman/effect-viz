import { describe, expect, it } from "vitest";

import { makeOriginTagger } from "@/runtime/traceOrigin";
import type { TraceEvent } from "@/types/trace";

const fork = (fiberId: string): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  label: fiberId,
  timestamp: 0,
});
const suspend = (fiberId: string): TraceEvent => ({
  type: "fiber:suspend",
  fiberId,
  timestamp: 0,
});
const resume = (fiberId: string): TraceEvent => ({
  type: "fiber:resume",
  fiberId,
  timestamp: 0,
});
const forkChild = (fiberId: string, parentId: string): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  parentId,
  label: fiberId,
  timestamp: 0,
});
const effectStart = (label: string): TraceEvent => ({
  type: "effect:start",
  id: label,
  label,
  timestamp: 0,
});

/** Feeds a run through a tagger and reports what each event came out as. */
function origins(startPaused: boolean, events: TraceEvent[]) {
  const tag = makeOriginTagger({ startPaused });
  return events.map((event) => tag(event).origin ?? "program");
}

describe("makeOriginTagger", () => {
  it("tags the injected yield's suspend and resume on a paused start", () => {
    expect(
      origins(true, [
        fork("#2"),
        suspend("#2"),
        resume("#2"),
        effectStart("initialization"),
      ]),
    ).toEqual(["program", "tool", "tool", "program"]);
  });

  it("tags nothing when the run was not started paused", () => {
    expect(origins(false, [fork("#2"), suspend("#2"), resume("#2")])).toEqual([
      "program",
      "program",
      "program",
    ]);
  });

  it("leaves the program's own later suspends alone", () => {
    expect(
      origins(true, [
        fork("#2"),
        suspend("#2"),
        resume("#2"),
        suspend("#2"),
        resume("#2"),
      ]),
    ).toEqual(["program", "tool", "tool", "program", "program"]);
  });

  it("does not mistake the root's id for another fiber's", () => {
    // The container and the in-browser runtime number their fibers differently,
    // so the root is whatever forked first, not a fixed id.
    expect(
      origins(true, [fork("#0"), suspend("#3"), suspend("#0"), resume("#0")]),
    ).toEqual(["program", "program", "tool", "tool"]);
  });

  it("gives up when the root does something other than yield first", () => {
    // The injected yield is no longer the explanation, so a later suspend is
    // the program's and must not be hidden.
    expect(
      origins(true, [
        fork("#2"),
        effectStart("something"),
        suspend("#2"),
        resume("#2"),
      ]),
    ).toEqual(["program", "program", "program", "program"]);
  });

  it("does not tag a resume that is not the injected yield's", () => {
    expect(
      origins(true, [
        fork("#2"),
        suspend("#2"),
        effectStart("x"),
        resume("#2"),
      ]),
    ).toEqual(["program", "tool", "program", "program"]);
  });

  it("gives up when a run does not open with the root's fork", () => {
    // Every run opens with it, so anything else means this is not the run the
    // tagger expects — and the next fork would be a child, not the root.
    expect(
      origins(true, [
        effectStart("unexpected"),
        fork("#2"),
        suspend("#2"),
        resume("#2"),
      ]),
    ).toEqual(["program", "program", "program", "program"]);
  });

  it("gives up when the root forks a child instead of yielding", () => {
    // A fork names the fiber being created, so only its parent says who acted.
    expect(
      origins(true, [
        fork("#2"),
        forkChild("#3", "#2"),
        suspend("#2"),
        resume("#2"),
      ]),
    ).toEqual(["program", "program", "program", "program"]);
  });

  it("keeps waiting when a fiber other than the root forks", () => {
    expect(
      origins(true, [
        fork("#2"),
        forkChild("#4", "#3"),
        suspend("#2"),
        resume("#2"),
      ]),
    ).toEqual(["program", "program", "tool", "tool"]);
  });

  it("leaves every other field of an event untouched", () => {
    const tag = makeOriginTagger({ startPaused: true });
    tag(fork("#2"));

    expect(tag(suspend("#2"))).toEqual({
      type: "fiber:suspend",
      fiberId: "#2",
      timestamp: 0,
      origin: "tool",
    });
  });
});
