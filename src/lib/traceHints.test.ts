import { describe, expect, it } from "vite-plus/test";

import type { SuspendReason, TraceEvent } from "@/types/trace";

import { hintText, traceHints } from "./traceHints";

const fork = (fiberId: string, parentId?: string): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  parentId,
  label: fiberId,
  timestamp: 0,
});
const yieldNow: SuspendReason = { kind: "yield" };
const wait: SuspendReason = { kind: "wait" };
const sleep = (duration: number): SuspendReason => ({
  kind: "sleep",
  duration,
});
const suspend = (
  fiberId: string,
  reason: SuspendReason,
  timestamp = 0,
): TraceEvent => ({
  type: "fiber:suspend",
  fiberId,
  reason,
  timestamp,
});
const resume = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "fiber:resume",
  fiberId,
  timestamp,
});
const end = (
  fiberId: string,
  timestamp = 0,
  result: "success" | "failure" = "success",
): TraceEvent => ({
  type: "fiber:end",
  fiberId,
  result,
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
  error: "boom",
  timestamp,
});
const interrupted = (
  id: string,
  fiberId: string,
  timestamp = 0,
): TraceEvent => ({
  type: "effect:end",
  id,
  fiberId,
  result: "interrupted",
  timestamp,
});
const succeeded = (id: string, fiberId: string, timestamp = 0): TraceEvent => ({
  type: "effect:end",
  id,
  fiberId,
  result: "success",
  value: undefined,
  timestamp,
});
const attempt = (fiberId: string, timestamp = 0): TraceEvent => ({
  type: "retry:attempt",
  id: "task",
  fiberId,
  label: "task",
  attempt: 1,
  lastError: "boom",
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

/**
 * Cooperative Interleaving: #1 forks #2 and #3, which take turns by yielding,
 * then joins them. A busy main thread resumes each yield `lag` ms late.
 */
const interleaving = (lag: number) => [
  fork("#1"),
  fork("#2", "#1"),
  fork("#3", "#1"),
  suspend("#1", wait),
  resume("#2"),
  suspend("#2", yieldNow),
  resume("#3", lag),
  suspend("#3", yieldNow, lag),
  resume("#2", 2 * lag),
  end("#2", 2 * lag),
  resume("#1", 2 * lag),
  suspend("#1", wait, 2 * lag),
  resume("#3", 3 * lag),
  end("#3", 3 * lag),
  resume("#1", 3 * lag),
  end("#1", 3 * lag),
];

/** Each row's hint, with references resolved to row numbers when nothing is hidden. */
function hintsOf(events: TraceEvent[], indentByFiber = false) {
  return Object.fromEntries(
    [...traceHints(events, { indentByFiber })].map(([index, hints]) => [
      index,
      hintText(hints, (ref) => ref + 1),
    ]),
  );
}

describe("traceHints", () => {
  it("reads a yield resumed late, as WebKit does, like one resumed at once", () => {
    const late = hintsOf(interleaving(15));
    expect(late).toEqual(hintsOf(interleaving(0)));
    expect(Object.values(late)).toContain(
      "#2 gave up the thread, so the runtime ran #3, first in the queue.",
    );
  });

  it("does not time a sleep interrupted in the same instant it started", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      resume("#1"),
      suspend("#1", sleep(1000)),
      resume("#1"),
    ]);
    expect(hints[4]).toBeUndefined();
  });

  // The Basic Example's shape: root forks one worker, joins it, the worker sleeps.
  const basic = [
    fork("#0"),
    fork("#8", "#0"),
    suspend("#0", wait),
    resume("#8"),
    suspend("#8", sleep(1000)),
    resume("#8", 1000),
    end("#8", 1000),
    resume("#0", 1000),
    end("#0", 1000),
  ];

  it("explains a queued fork, the handoff that runs it and the join", () => {
    expect(hintsOf(basic)).toEqual({
      1: "The fork only queues #8: it first runs at [4], once #0 yields.",
      3: "#0 gave up the thread, so the runtime ran #8, first in the queue.",
      4: "Async boundary: the fiber parks and frees the thread.",
      5: "Time the fiber spent parked.",
      7: "#8's end resumed #0, which was waiting on it.",
    });
  });

  it("falls back to the text without a row number when that row is hidden", () => {
    const [[, hints]] = traceHints(basic, { indentByFiber: false });
    expect(hintText(hints, () => undefined)).toBe(
      "The fork only queues #8: it first runs once #0 yields.",
    );
  });

  it("says a queued fork waits for a fiber's end when that is what runs it", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      fork("#2", "#0"),
      suspend("#0", wait),
      resume("#1"),
      end("#1"),
      resume("#2"),
    ]);
    expect(hints[2]).toBe(
      "The fork only queues #2: it first runs at [7], once #1 ends.",
    );
    expect(hints[6]).toBeUndefined();
  });

  it("explains a fork that runs its child at once on the child's resume", () => {
    const hints = hintsOf([fork("#0"), fork("#1", "#0"), resume("#1")]);
    expect(hints).toEqual({
      2: "#1 runs at once: this fork starts the child itself instead of queuing it.",
    });
  });

  it("tells a fiber run from the queue from one that woke on its own timer", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      resume("#1"),
      suspend("#1", yieldNow),
      fork("#2", "#0"),
      resume("#2"),
      suspend("#2", yieldNow, 0),
      resume("#1", 0),
      suspend("#1", sleep(500), 0),
      suspend("#2", wait, 500),
      resume("#1", 500),
    ]);
    expect(hints[7]).toBe(
      "#2 gave up the thread, so the runtime ran #1, first in the queue.",
    );
    expect(hints[6]).toBeUndefined();
    expect(hints[10]).toBe("Time the fiber spent parked.");
    expect(hints[9]).toBe(
      "Async boundary: the fiber parks and frees the thread.",
    );
  });

  it("does not call a resume long after a fiber's end a handoff", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      resume("#1"),
      suspend("#1", sleep(500)),
      fork("#2", "#0"),
      resume("#2"),
      suspend("#2", sleep(1000)),
      resume("#1", 500),
      end("#1", 500),
      resume("#2", 1000),
    ]);
    expect(hints[9]).toBe("Time the fiber spent parked.");
  });

  it("explains a suspend and resume in the same instant once, on the suspend", () => {
    const events = [
      fork("#0"),
      suspend("#0", yieldNow, 300),
      resume("#0", 301),
    ];
    expect(hintsOf(events)).toEqual({
      1: "The fiber gave up the thread and got it back at [3]: nothing else was ready to run.",
    });
    const [[, hints]] = traceHints(events, { indentByFiber: false });
    expect(hintText(hints, () => undefined)).toBe(
      "The fiber gave up the thread and got it back straight away: nothing else was ready to run.",
    );
  });

  it("does not call a resume in the same instant as its suspend parked", () => {
    const hints = hintsOf([
      fork("#0"),
      start("span", "#0"),
      suspend("#0", yieldNow, 300),
      succeeded("span", "#0", 301),
      resume("#0", 302),
    ]);
    expect(hints[4]).toBeUndefined();
  });

  it("explains the start of a retry attempt after the schedule's delay", () => {
    const hints = hintsOf([
      fork("#0"),
      suspend("#0", sleep(100)),
      resume("#0", 100),
      attempt("#0", 100),
    ]);
    expect(hints[3]).toBe(
      "The schedule's delay is over: the next attempt starts here.",
    );
  });

  describe("interruption", () => {
    // Structured Interruption's unwinding: #1 forked #2, both parked, then
    // #0 interrupts #1, which interrupts #2 before it ends.
    const unwinding = [
      fork("#0"),
      fork("#1", "#0"),
      fork("#2", "#1"),
      suspend("#0", sleep(300)),
      resume("#1"),
      suspend("#1", wait),
      resume("#2"),
      start("child", "#2"),
      suspend("#2", sleep(1000)),
      resume("#0", 300),
      resume("#1", 300),
      finalizer("parent-cleanup", "#1", 300),
      resume("#2", 300),
      interrupted("child", "#2", 300),
      finalizer("child-cleanup", "#2", 300),
      interrupt("#2", 300),
      interrupt("#1", 300),
      end("#0", 300),
    ];

    it("ties an interrupted span to its fiber's interrupt", () => {
      const hints = hintsOf(unwinding);
      expect(hints[13]).toBe(
        "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #2 is interrupted at [16].",
      );
      const all = traceHints(unwinding, { indentByFiber: false });
      expect(hintText(all.get(13) ?? [], () => undefined)).toBe(
        "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #2 is interrupted.",
      );
    });

    it("explains a lone finalizer run by interruption", () => {
      const hints = hintsOf(unwinding);
      expect(hints[11]).toBe(
        "Interruption still closes the scope, so the finalizer runs.",
      );
      expect(hints[14]).toBe(
        "Interruption still closes the scope, so the finalizer runs.",
      );
    });

    it("says a child is interrupted before its parent ends", () => {
      const hints = hintsOf(unwinding);
      expect(hints[15]).toBe("#2 is interrupted before #1 ends.");
      expect(hints[16]).toBe("#1 is interrupted before #0 ends.");
    });

    it("says a parent interrupts its child before moving on", () => {
      const hints = hintsOf([
        fork("#0"),
        fork("#1", "#0"),
        resume("#1"),
        suspend("#1", sleep(1000)),
        suspend("#0", sleep(300)),
        resume("#0", 300),
        interrupt("#1", 300),
        start("next", "#0", 300),
      ]);
      expect(hints[6]).toBe("#0 interrupts its child #1 before moving on.");
    });

    it("waits for the parent's next row before explaining a child's interrupt", () => {
      const hints = hintsOf([
        fork("#0"),
        fork("#1", "#0"),
        resume("#1"),
        suspend("#1", sleep(1000)),
        suspend("#0", sleep(300)),
        resume("#0", 300),
        interrupt("#1", 300),
      ]);
      expect(hints[6]).toBeUndefined();
    });

    it("leaves an interrupt alone while the parent is not running", () => {
      const hints = hintsOf([
        fork("#0"),
        fork("#1", "#0"),
        resume("#1"),
        suspend("#1", sleep(1000)),
        suspend("#0", sleep(300)),
        interrupt("#1", 300),
        resume("#0", 300),
      ]);
      expect(hints[5]).toBeUndefined();
    });

    it("says a fiber that catches an interrupted span carries on", () => {
      // Effect.interrupt caught inside the fiber: the span ends interrupted, the fiber goes on.
      const hints = hintsOf([
        fork("#0"),
        start("inner", "#0"),
        interrupted("inner", "#0"),
        start("after", "#0"),
      ]);
      expect(hints[2]).toBe(
        "The runtime closed this span with an interruption: it neither succeeded nor failed. The fiber caught it and carries on.",
      );
    });

    it("reads the unwinding by order, not time, on a slow machine", () => {
      const hints = hintsOf([
        fork("#0"),
        fork("#1", "#0"),
        start("child", "#1"),
        interrupted("child", "#1", 300),
        suspend("#0", wait, 320),
        finalizer("cleanup", "#1", 340),
        interrupt("#1", 380),
      ]);
      expect(hints[3]).toBe(
        "The runtime closed this span with an interruption: it neither succeeded nor failed. Its fiber #1 is interrupted at [7].",
      );
    });
  });

  describe("failure", () => {
    it("explains a failure the fiber recovers from", () => {
      const hints = hintsOf([
        fork("#0"),
        start("risky", "#0"),
        failed("risky", "#0"),
        start("recovery", "#0"),
      ]);
      expect(hints[2]).toBe("The failure was handled: the fiber carries on.");
    });

    it("leaves a failure that ends its fiber alone", () => {
      const hints = hintsOf([
        fork("#0"),
        start("outer", "#0"),
        start("risky", "#0"),
        failed("risky", "#0"),
        finalizer("cleanup", "#0"),
        failed("outer", "#0"),
        end("#0", 0, "failure"),
      ]);
      expect(hints[3]).toBeUndefined();
      expect(hints[5]).toBeUndefined();
    });

    it("leaves a failure followed by interruption alone", () => {
      const hints = hintsOf([
        fork("#0"),
        start("risky", "#0"),
        failed("risky", "#0"),
        interrupt("#0"),
      ]);
      expect(hints[2]).toBeUndefined();
    });

    it("calls a failure handled once an enclosing span succeeds", () => {
      const hints = hintsOf([
        fork("#0"),
        start("outer", "#0"),
        start("risky", "#0"),
        failed("risky", "#0"),
        succeeded("outer", "#0"),
      ]);
      expect(hints[3]).toBe("The failure was handled: the fiber carries on.");
    });
  });

  it("explains a worker's end that starts the next task", () => {
    const hints = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      resume("#1"),
      suspend("#1", sleep(500)),
      suspend("#0", wait),
      resume("#1", 500),
      end("#1", 500),
      fork("#2", "#0"),
      resume("#2", 500),
    ]);
    expect(hints[7]).toBe("#1 ending started the next task; #0 stays parked.");
  });

  it("leaves a fork alone when the parent runs or the ended fiber is not a sibling", () => {
    const running = hintsOf([
      fork("#0"),
      fork("#1", "#0"),
      resume("#1"),
      suspend("#1", sleep(500)),
      suspend("#0", sleep(500)),
      resume("#0", 500),
      end("#1", 500),
      fork("#2", "#0"),
      resume("#2", 500),
    ]);
    expect(running[7]).toBeUndefined();
    const stranger = hintsOf([
      fork("#0"),
      fork("#9"),
      resume("#9"),
      suspend("#0", wait),
      end("#9", 500),
      fork("#2", "#0"),
      resume("#2", 500),
    ]);
    expect(stranger[5]).toBeUndefined();
  });

  it("explains finalizers only when several run together", () => {
    const hints = hintsOf([
      fork("#0"),
      finalizer("f-2", "#0"),
      finalizer("f-1", "#0"),
      fork("#1", "#0"),
      finalizer("alone", "#1"),
      end("#1"),
    ]);
    expect(hints[1]).toBe("Finalizers run in reverse order of registration.");
    expect(hints[2]).toBe("Finalizers run in reverse order of registration.");
    expect(hints[4]).toBeUndefined();
  });

  it("explains the indent on the first indented row only", () => {
    expect(hintsOf(basic, true)[3]).toBe(
      "#0 gave up the thread, so the runtime ran #8, first in the queue. Indent is fiber depth, not identity: sibling fibers share a column.",
    );
    expect(hintsOf(basic)[3]).toBe(
      "#0 gave up the thread, so the runtime ran #8, first in the queue.",
    );
  });
});
