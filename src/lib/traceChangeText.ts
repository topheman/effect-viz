import type { TraceChangeKind } from "./traceChanges";

/** How each Effect 3 → 4 change reads in the Fiber Tree card: what the Effect 4 trace shows, and what Effect 3 did instead. */
export const TRACE_CHANGE_TEXT: Record<
  TraceChangeKind,
  { title: string; effect4: string; effect3: string }
> = {
  "synchronous-interruption": {
    title: "Interruption is synchronous",
    effect4:
      "The target unwinds right away, inside the interrupter's own step.",
    effect3: "The interrupter suspended until its target had shut down.",
  },
  "joiner-runs-first": {
    title: "A joiner runs first",
    effect4:
      "A child's end resumes the fiber joining it, ahead of a fiber already waiting.",
    effect3: "The joiner was queued behind the fibers already waiting.",
  },
  "fork-runs-at-once": {
    title: "An operator's fork runs at once",
    effect4:
      "Operators such as race and timeout start each child inside the parent's step.",
    effect3: "Every fork was queued and started on a later turn.",
  },
  "fiber-per-element": {
    title: "One fiber per task",
    effect4:
      "Each task gets its own fiber, and the next one starts when one ends.",
    effect3:
      "With a concurrency limit, a few worker fibers ran the tasks in turn.",
  },
  "zero-sleep-retry": {
    title: "A retry sleeps for zero",
    effect4:
      "A retry with no delay still sleeps, so the fiber suspends between attempts.",
    effect3: "Attempts followed one another without a suspend.",
  },
};
