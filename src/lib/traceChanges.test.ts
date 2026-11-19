import { describe, expect, it } from "vite-plus/test";

import type { TraceEvent } from "@/types/trace";

import { traceChanges } from "./traceChanges";

const fork = (fiberId: string, parentId?: string): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  parentId,
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
  result: "success",
  timestamp,
});
const interrupt = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "fiber:interrupt",
  fiberId,
  timestamp,
});
const finalizer = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "finalizer",
  id: `${fiberId}-cleanup`,
  fiberId,
  label: `${fiberId}-cleanup`,
  timestamp,
});
const retried = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "retry:attempt",
  id: "task",
  fiberId,
  label: "task",
  attempt: 1,
  lastError: "boom",
  timestamp,
});

describe("traceChanges", () => {
  it("finds nothing in a trace Effect 3 would have drawn the same", () => {
    expect(
      traceChanges([
        fork("#1"),
        fork("#2", "#1"),
        suspend("#1"),
        resume("#2"),
        suspend("#2"),
        resume("#2", 500),
        end("#2", 500),
        resume("#1", 500),
        end("#1", 500),
      ]),
    ).toEqual([]);
  });

  describe("synchronous-interruption", () => {
    it("is a fiber resumed, unwound and interrupted inside its interrupter's step", () => {
      expect(
        traceChanges([
          fork("#1"),
          fork("#2", "#1"),
          suspend("#1"),
          resume("#2"),
          suspend("#2"),
          resume("#1", 300),
          resume("#2", 300),
          finalizer("#2", 300),
          interrupt("#2", 300),
          end("#1", 300),
        ]),
      ).toEqual([
        {
          kind: "synchronous-interruption",
          rows: [6, 8],
          fibers: ["#1", "#2"],
        },
      ]);
    });

    it("is not an interrupter that suspended before its target resumed", () => {
      expect(
        traceChanges([
          fork("#1"),
          fork("#2", "#1"),
          suspend("#1"),
          resume("#2"),
          suspend("#2"),
          resume("#1", 300),
          suspend("#1", 300),
          resume("#2", 300),
          interrupt("#2", 300),
          resume("#1", 300),
          end("#1", 300),
        ]),
      ).toEqual([]);
    });

    it("is not a target that suspends again before it is interrupted", () => {
      expect(
        traceChanges([
          fork("#1"),
          fork("#2", "#1"),
          suspend("#1"),
          resume("#1", 300),
          resume("#2", 300),
          suspend("#2", 300),
          interrupt("#2", 400),
          end("#1", 400),
        ]),
      ).toEqual([]);
    });

    it("is not the root, interrupted from outside the program", () => {
      expect(
        traceChanges([
          fork("#1"),
          suspend("#1"),
          resume("#1", 9),
          interrupt("#1", 9),
        ]),
      ).toEqual([]);
    });
  });

  describe("joiner-runs-first", () => {
    const yielding = [
      fork("#1"),
      fork("#2", "#1"),
      fork("#3", "#1"),
      suspend("#1"),
      resume("#2"),
      suspend("#2"),
      resume("#3"),
      suspend("#3"),
      resume("#2", 1),
      end("#2", 1),
    ];

    it("is a joiner resumed by its child's end ahead of a fiber that yielded", () => {
      expect(
        traceChanges([
          ...yielding,
          resume("#1", 1),
          suspend("#1", 1),
          resume("#3", 1),
          end("#3", 1),
          resume("#1", 1),
          end("#1", 1),
        ]),
      ).toEqual([
        {
          kind: "joiner-runs-first",
          rows: [9, 10, 12],
          fibers: ["#1", "#2", "#3"],
        },
      ]);
    });

    it("is not a joiner resumed after the fiber that yielded", () => {
      expect(
        traceChanges([
          ...yielding,
          resume("#3", 1),
          end("#3", 1),
          resume("#1", 1),
          end("#1", 1),
        ]),
      ).toEqual([]);
    });

    it("is not a joiner resumed ahead of a fiber waiting on its own timer", () => {
      expect(
        traceChanges([
          fork("#1"),
          fork("#2", "#1"),
          fork("#3", "#1"),
          suspend("#1"),
          resume("#2"),
          suspend("#2"),
          resume("#3"),
          suspend("#3"),
          resume("#2", 1000),
          end("#2", 1000),
          resume("#1", 1000),
          suspend("#1", 1000),
          resume("#3", 1500),
          end("#3", 1500),
          resume("#1", 1500),
          end("#1", 1500),
        ]),
      ).toEqual([]);
    });
  });

  describe("fork-runs-at-once", () => {
    it("is a fork whose child resumes on the next row", () => {
      expect(
        traceChanges([
          fork("#1"),
          fork("#2", "#1"),
          resume("#2"),
          end("#2"),
          end("#1"),
        ]),
      ).toEqual([
        { kind: "fork-runs-at-once", rows: [1, 2], fibers: ["#1", "#2"] },
      ]);
    });

    it("is not a fork that only queues its child", () => {
      expect(
        traceChanges([
          fork("#1"),
          fork("#2", "#1"),
          suspend("#1"),
          resume("#2"),
          end("#2"),
          resume("#1"),
          end("#1"),
        ]),
      ).toEqual([]);
    });
  });

  describe("fiber-per-element", () => {
    const pool = (parentState: TraceEvent) => [
      fork("#1"),
      fork("#2", "#1"),
      suspend("#2"),
      parentState,
      resume("#2", 500),
      end("#2", 500),
      fork("#3", "#1"),
    ];

    it("is a fork that follows a sibling's end while the parent is parked", () => {
      expect(traceChanges(pool(suspend("#1")))).toEqual([
        { kind: "fiber-per-element", rows: [5, 6], fibers: ["#1", "#2", "#3"] },
      ]);
    });

    it("is not a fork the running parent makes itself", () => {
      expect(traceChanges(pool(resume("#1")))).toEqual([]);
    });
  });

  describe("zero-sleep-retry", () => {
    const retry = (delay: number) => [
      fork("#1"),
      suspend("#1"),
      resume("#1", delay),
      retried("#1", delay),
      end("#1", delay),
    ];

    it("is a suspend and resume in the same instant before an attempt", () => {
      expect(traceChanges(retry(0))).toEqual([
        { kind: "zero-sleep-retry", rows: [1, 2], fibers: ["#1"] },
      ]);
    });

    it("is not a retry that waited for the schedule's delay", () => {
      expect(traceChanges(retry(100))).toEqual([]);
    });
  });

  it("lists kinds by the first row that shows each", () => {
    const kinds = traceChanges([
      fork("#1"),
      suspend("#1"),
      resume("#1"),
      retried("#1"),
      fork("#2", "#1"),
      resume("#2"),
      end("#2"),
      end("#1"),
    ]).map((change) => change.kind);
    expect(kinds).toEqual(["zero-sleep-retry", "fork-runs-at-once"]);
  });
});
