import { describe, expect, it } from "vitest";

import type { TraceEvent } from "@/types/trace";

import { traceHints } from "./traceHints";

const fork = (
  fiberId: string,
  parentId?: string,
  forkedBy = parentId,
): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  parentId,
  forkedBy,
  label: fiberId,
  timestamp: 0,
});
const suspend = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "fiber:suspend",
  fiberId,
  timestamp,
});
const resume = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "fiber:resume",
  fiberId,
  timestamp,
});
const end = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "fiber:end",
  fiberId,
  timestamp,
});
const interrupt = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "fiber:interrupt",
  fiberId,
  timestamp,
});
const start = (id: string, fiberId: string, timestamp = 0): TraceEvent => ({
  type: "effect:start",
  id,
  fiberId,
  label: id,
  timestamp,
});
const failed = (id: string, fiberId: string, timestamp = 0): TraceEvent => ({
  type: "effect:end",
  id,
  fiberId,
  result: "failure",
  error: "interrupted",
  timestamp,
});
const finalizer = (
  label: string,
  fiberId: string,
  timestamp = 0,
): TraceEvent => ({
  type: "finalizer",
  id: label,
  fiberId,
  label,
  timestamp,
});

function hintsOf(events: TraceEvent[], indentByFiber = false) {
  return Object.fromEntries(traceHints(events, { indentByFiber }));
}

describe("traceHints", () => {
  // The Basic Example's shape: root forks one worker, joins it, the worker sleeps.
  const basic = [
    fork("#0"),
    fork("#8", "#0"),
    suspend("#0"),
    resume("#8"),
    suspend("#8"),
    resume("#8", 1000),
    end("#8", 1000),
    suspend("#8", 1000),
    resume("#0", 1000),
    end("#0", 1000),
  ];

  it("explains suspends, first runs, waits and handoffs", () => {
    expect(hintsOf(basic)).toEqual({
      3: "Forking only queues #8; it first runs here, once #0 yields.",
      4: "Async boundary: the fiber parks and frees the thread.",
      5: "Time the fiber spent parked.",
      7: "Every run ends with a suspend, even the last; the root has none because the visualizer's hooks are unwound by then.",
      8: "#8 finished, so the runtime ran the next ready fiber, #0.",
    });
  });

  it("names a handoff from a fiber that is still alive", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      fork("#2", "#0"),
      suspend("#0"),
      resume("#1"),
      suspend("#1"),
      resume("#0"),
    ]);
    expect(hints[6]).toBe(
      "#1 parked, so the runtime ran the next ready fiber, #0.",
    );
    expect(hints[5]).toBeUndefined();
  });

  it("does not call a resume after idle time a handoff", () => {
    const hints = hintsOf([
      fork("#0"),
      suspend("#0"),
      resume("#0"),
      suspend("#0", 0),
      resume("#0", 500),
    ]);
    expect(hints[4]).toBe("Time the fiber spent parked.");
  });

  it("explains a suspend and resume with nothing between once, on the suspend", () => {
    const hints = hintsOf([fork("#0"), suspend("#0", 300), resume("#0", 300)]);
    expect(hints).toEqual({
      1: "The fiber hit an async boundary that was already settled, so it resumed at once.",
    });
  });

  it("explains a failed span that interruption closed", () => {
    const hints = hintsOf([
      fork("#0"),
      start("child", "#0"),
      failed("child", "#0", 300),
      finalizer("cleanup", "#0", 300),
      interrupt("#0", 300),
    ]);
    expect(hints[2]).toBe("Interruption ends the open span as a failure.");
  });

  // Timestamps from a real run of structuredInterruption: each emitter reads the
  // clock itself, and the span's end is stamped before the rows around it.
  it("reads events a few milliseconds apart as one instant", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      start("child-1", "#0", 5.708),
      suspend("#0", 6.0),
      resume("#0", 6.007),
      suspend("#0", 6.094),
      resume("#1", 6.1),
      suspend("#1", 6.2),
      resume("#0", 313.656),
      failed("child-1", "#0", 314.708),
      finalizer("child-1-cleanup", "#0", 315.769),
      interrupt("#0", 316.144),
      suspend("#0", 316.154),
      resume("#1", 316.311),
    ]);
    expect(hints[3]).toBe(
      "The fiber hit an async boundary that was already settled, so it resumed at once.",
    );
    expect(hints[8]).toBe("Time the fiber spent parked.");
    expect(hints[9]).toBe("Interruption ends the open span as a failure.");
    expect(hints[13]).toBe(
      "#0 finished, so the runtime ran the next ready fiber, #1.",
    );
  });

  it("leaves a failure that was not followed by interruption alone", () => {
    const hints = hintsOf([
      fork("#0"),
      start("risky", "#0"),
      failed("risky", "#0"),
      start("recovery", "#0"),
      interrupt("#0"),
    ]);
    expect(hints[2]).toBeUndefined();
  });

  it("explains finalizers only when several run together", () => {
    const hints = hintsOf([
      fork("#0"),
      finalizer("f-2", "#0"),
      finalizer("f-1", "#0"),
      fork("#1", "#0"),
      finalizer("alone", "#1"),
    ]);
    expect(hints[1]).toBe("Finalizers run in reverse order of registration.");
    expect(hints[2]).toBe("Finalizers run in reverse order of registration.");
    expect(hints[4]).toBeUndefined();
  });

  it("does not depend on which rows are displayed", () => {
    const withToolYield: TraceEvent[] = [
      fork("#0"),
      { ...suspend("#0"), origin: "tool" },
      { ...resume("#0"), origin: "tool" },
    ];
    expect(hintsOf(withToolYield)[1]).toBeDefined();
  });

  describe("with indent by fiber", () => {
    it("adds the placement hints on their first occurrence", () => {
      const hints = hintsOf(basic, true);
      expect(hints[1]).toBe(
        "Indented with the fiber that forked it: forking is that fiber's action, and the child's rows start at its first resume.",
      );
      expect(hints[3]).toBe(
        "Forking only queues #8; it first runs here, once #0 yields. Indent is fiber depth, not identity: sibling fibers share a column.",
      );
      expect(hints[6]).toBe(
        "Indented with the child: ending is its own last action.",
      );
      expect(hints[9]).toBeUndefined();
    });

    it("explains a fork run by a fiber other than the parent", () => {
      const hints = hintsOf(
        [fork("#87"), fork("#95", "#87"), fork("#96", "#87", "#95")],
        true,
      );
      expect(hints[2]).toContain(
        "Indented with #95, which ran the fork; #96 itself sits under #87, whose context it inherits.",
      );
    });

    it("leaves the placement hints out of the flat log", () => {
      expect(hintsOf(basic)[1]).toBeUndefined();
    });
  });
});
