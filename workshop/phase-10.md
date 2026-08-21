# Phase 10: Slow Mode and Stepper (issue #13)

**Status**: 🚧 IN PROGRESS — step 1 of 6 complete

Issue [#13](https://github.com/topheman/effect-viz/issues/13) asks for a slow mode:
_"It goes too fast so a slow stepper would be cool like Browser Debugger is."_

## Design Summary

Two controls, driven by one mechanism:

- **Speed combo** (`x1 / x0.75 / x0.5 / x0.25`) — scales the Effect `Clock`, so
  time itself runs slower.
- **Stepper** (`⏯️ ⏭️`) — freezes the world and releases one scheduling decision
  at a time.

### Why the Clock is the lever

Everything in Effect's model routes through the `Clock` service:

- `Effect.sleep` → `defaultServices.sleep` → `clockWith((clock) => clock.sleep(d))`
  (`internal/defaultServices.ts:45`)
- `Schedule` drivers read `Clock.currentTimeMillis` (`internal/schedule.ts:170`)
- `Effect.log` timestamps come from `clockService.unsafeCurrentTimeMillis()`
  (`internal/fiberRuntime.ts:871`)

Scaling *all* of time uniformly means `race`, `timeout` and exponential backoff
stretch together, so the program's observable semantics are unchanged — it is
genuine slow motion, not a distortion. This is why we instrument the runtime
rather than replaying recorded events in the UI.

### Why speed alone is not enough

Effect programs emit trace events in two very different rhythms. Most events
arrive in **bursts with no measurable gap between them** — many operations running
inside a single uninterrupted fiber run-step. The rest are separated by **hundreds
of milliseconds**, because a fiber is parked waiting on the clock.

That split is exactly the `fiber:suspend` / `fiber:resume` boundary, and it is why
the clock is only half the answer: scaling time stretches the waiting, but the
bursts are not clock-mediated, so they stay a flash at every speed. Making the
sleeps longer does not make the interesting moments readable — and those bursts
are where forks, races and interruptions actually happen.

**Speed handles the sleeps, the stepper handles the bursts.** Neither covers both,
which is why the two controls belong together.

### Step is a pause-mode operation

Two independent things advance the world: the clock ticking, and the scheduler
running runnable tasks. With speed > 0 both are free-running, so pressing ⏭️ would
be decorative — the resume arrives on its own regardless. So ⏭️ freezes first
(rate → 0 *and* gate the scheduler), then releases exactly one thing, like a
browser debugger where step is only available while paused.

### The step ladder

Frozen world, user clicks next. Because we supply both the `Scheduler` and the
`Clock`, we know nearly everything that could happen next:

1. **A runnable task is queued** → release exactly one.
2. **Nothing runnable, timers pending** → advance virtual time to the earliest
   deadline, making that fiber runnable, then release it. (`TestClock.adjust`
   semantics.)
3. **Nothing runnable, no timers, fibers waiting on each other** → deadlock, and
   we can say so.
4. **Nothing runnable, no timers, something out on external async** → cannot step;
   the outside world must answer.

Case 4 is the real limit: external callbacks are not in our queue, so they can
only be inferred by elimination.

## Implementation Steps

| # | Step | Status |
|---|------|--------|
| 1 | `VirtualClock` — shared virtual time source | ✅ |
| 2 | Effect `Clock` layer built on `VirtualClock` | ⬜ |
| 3 | `Date` shim in the WebContainer runner | ⬜ |
| 4 | Gated `Scheduler` + the step ladder | ⬜ |
| 5 | UI: speed combo + ⏯️ ⏭️ in `PlaybackControls` | ⬜ |
| 6 | Example programs + explainers | ⬜ |

## Step 1: VirtualClock ✅

### Created Files

| File | Contents |
|------|----------|
| `src/runtime/virtualClock.ts` | `VirtualClock` — the single virtual time source |
| `src/runtime/virtualClock.test.ts` | 23 tests, including the pause and re-arm regression tests |

Virtual time is a piecewise-linear function of wall time, advancing at `rate`
virtual ms per wall ms. Every rate change **re-anchors** the mapping, so virtual
time is continuous — it never jumps when the user changes speed, only its slope
changes.

```ts
now() = virtualAnchor + (wallNow - wallAnchor) * rate
```

### Key Learnings

#### Pause must park, not divide

The obvious implementation of a scaled sleep is `setTimeout(fn, d / rate)`. At
rate 0 that is `setTimeout(fn, Infinity)`, and Node says:

```
TimeoutOverflowWarning: Infinity does not fit into a 32-bit signed integer.
Timeout duration was set to 1.
Infinity delay fired after 5 ms
```

So the naive version makes **pause wake every sleeping fiber almost immediately** —
the exact inverse of pause, and it looks like a race condition rather than an
arithmetic bug. Instead, `rate = 0` *parks* pending timers (clears the real
timeout, keeps the virtual deadline) and re-arms them on resume with the time
that was actually remaining.

#### The clock must not read its own shim

`Date.now` is captured at module load, before any shim is installed. The `Date`
shim will read the `VirtualClock`, so if the clock read `Date.now()` dynamically
the two would recurse. The wall-clock primitives are injectable
(`VirtualClockHost`), which is also what makes the tests deterministic under
vitest fake timers.

#### `advanceToNextDeadline()` is rung 2 of the ladder

Stepping a time-blocked fiber means jumping virtual time to the earliest pending
deadline and firing what is due — with no wall time passing at all. A chain of
sleeps can be stepped through instantly, which is exactly what `TestClock` does
in tests.

Jumping time forward invalidates the timers that did *not* fire: they were armed
against the previous anchor, so they would go off late by exactly the amount of
virtual time the jump skipped. Everything still pending is therefore re-armed
after the jump. While paused this is a no-op, because parked timers hold no real
timeout at all.

#### Chained sleeps re-base themselves

A sleep scheduled from inside another sleep's callback takes its deadline from
virtual time *at the moment it is scheduled*, so error never accumulates across a
chain and a rate change between two links applies cleanly to the second one. The
same holds when the chain is interrupted by a pause: the inner sleep parks like
any other.

### What this unlocks

A single source of truth for time that can run at any rate, freeze without
distortion, and be stepped forward deadline by deadline — with no dependency on
Effect yet, so it is testable in isolation.
