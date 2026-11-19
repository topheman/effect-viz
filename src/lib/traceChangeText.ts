import type { TraceChangeKind } from "./traceChanges";

/** How each Effect 3 → 4 change reads in the Fiber Tree card: what the Effect 4 trace shows, and what Effect 3 did instead. */
export const TRACE_CHANGE_TEXT: Record<
  TraceChangeKind,
  { title: string; effect4: string; effect3: string }
> = {
  "synchronous-interruption": {
    title: "Interruption is synchronous",
    effect4:
      "The interrupted fiber resumes, unwinds and ends while its interrupter is still running.",
    effect3: "The interrupter suspended until its target had ended.",
  },
  "joiner-runs-first": {
    title: "A joiner runs first",
    effect4:
      "A child's end resumes the fiber joining it, ahead of a fiber already waiting.",
    effect3: "The joiner was queued behind the fibers already waiting.",
  },
  "fork-runs-at-once": {
    title: "A fork runs at once",
    effect4: "The child starts inside its parent's step.",
    effect3: "Every fork was queued and started on a later turn.",
  },
  "fiber-per-element": {
    title: "One fiber per element",
    effect4:
      "Concurrent elements each get a fiber, the next forked when one ends.",
    effect3: "A few worker fibers took the elements in turn, with no new fork.",
  },
  "zero-sleep-retry": {
    title: "A retry sleeps for zero",
    effect4:
      "A retry with no delay still sleeps, so the fiber suspends between attempts.",
    effect3: "Attempts followed one another without a suspend.",
  },
};
