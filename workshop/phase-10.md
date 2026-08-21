# Phase 10: Slow Mode and Stepper (issue #13)

**Status**: 🚧 IN PROGRESS — step 3 of 6 complete

Issue [#13](https://github.com/topheman/effect-viz/issues/13) asks for a slow mode:
_"It goes too fast so a slow stepper would be cool like Browser Debugger is."_

## Design Summary

Two controls, driven by one mechanism:

- **Speed combo** (`x1 / x0.75 / x0.5 / x0.25`) — scales the Effect `Clock`, so
  time itself runs slower.
- **Stepper** (`⏯️ ⏭️`) — freezes the world and releases one scheduling decision
  at a time.

### Two clocks: wall and virtual

Everything in this phase depends on separating two notions of time, so the terms
are used precisely throughout.

**Wall time** is real elapsed time — what a stopwatch sitting next to the computer
would measure. It comes from `Date.now()` and `performance.now()`, it always moves
forward, and nothing we do can slow it down.

**Virtual time** is the time the *program* believes it is living in. It is what
the Effect `Clock` service reports and what `Effect.sleep` counts down in. We
control it completely.

The two are connected by a single number, the **rate**: virtual time advances by
`rate` milliseconds for every millisecond of wall time.

- At **rate 1** the two are indistinguishable — this is normal execution.
- At **rate 0.5** an `Effect.sleep("1 second")` still measures 1 second of virtual
  time, but 2 seconds pass on the wall while it waits.
- At **rate 0** virtual time stops entirely while wall time keeps going. The
  program is frozen; the browser is not.

The reason this preserves the program's behaviour is that **the program only ever
observes virtual time**. It cannot tell it is running in slow motion, because
every duration it can measure — sleeps, timeouts, schedule delays, race outcomes,
even `Effect.log` timestamps — is expressed in the same stretched units. Nothing
is skewed relative to anything else.

Two deliberate exceptions exist on the wall side. `performance.now()` is left
untouched, so there is always a way to measure how much real time something took
(useful for debugging this feature itself). And raw `setTimeout` in user code is
not intercepted: it is already invisible to Effect's runtime, and code reaching
for it has stepped outside the model the visualizer is showing.

In the code, `VirtualClock` holds a `wallAnchor` and a `virtualAnchor` — the pair
of readings taken the last time the rate changed. Every conversion between the
two clocks is measured from that pair.

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
| 2 | Effect `Clock` layer built on `VirtualClock` | ✅ |
| 3 | `Date` shim in the WebContainer runner | ✅ |
| 4 | Gated `Scheduler` + the step ladder | ⬜ |
| 5 | UI: speed combo + ⏯️ ⏭️ in `PlaybackControls` | ⬜ |
| 6 | Example programs + explainers | ⬜ |

## Step 1: VirtualClock ✅

### Created Files

| File | Contents |
|------|----------|
| `src/runtime/virtualClock.ts` | `VirtualClock` — the single virtual time source |
| `src/runtime/virtualClock.test.ts` | 28 tests: pause and re-arm regressions, chained sleeps, at-most-once |

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

The `Date` shim reads the `VirtualClock`, so the clock must never read `Date`
back. Capturing `Date.now` at module load would achieve that, but only for as
long as this module is always evaluated before the shim is installed — a
guarantee living in import order, enforced by nothing, and failing as unbounded
recursion if broken.

Reading wall time from `performance.timeOrigin + performance.now()` instead makes
the clock immune by construction: `performance` is never shimmed, so no ordering
can bring the two into contact. It also makes wall time **monotonic**, so virtual
time cannot jump backwards when the system clock is corrected by NTP or changed
by hand.

The wall-clock primitives stay injectable (`VirtualClockHost`), which is what
makes the tests deterministic under vitest fake timers.

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

#### A callback can only run once

Three properties together guarantee it, and they matter because step 4 will drive
this clock from the scheduler:

- **`#fire` is the only place a callback is invoked**, and it removes the timer
  from the map *before* running it. Map membership is the claim to run.
- **Every path that fires or cancels clears the real timeout first**, so at most
  one is outstanding per timer.
- **Ids are monotonic**, so a stale callback can never alias a newer timer.

The first property is what actually makes it safe: even if a real timeout escaped
cancellation, it would reach `#fire`, find no entry, and no-op. The other two stop
strays from accumulating rather than from doing damage.

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

## Step 2: Effect Clock layer ✅

### Created Files

| File | Contents |
|------|----------|
| `src/runtime/vizClock.ts` | `makeVizClock`, `makeVizClockLayer` — Effect `Clock` over the `VirtualClock` |
| `src/runtime/vizClock.test.ts` | 10 tests driving real Effect programs |

`Layer.setClock` provides it, mirroring the `Layer.setTracer` idiom from phase 7.
The `Clock` interface is five members: `unsafeCurrentTimeMillis`,
`unsafeCurrentTimeNanos`, `currentTimeMillis`, `currentTimeNanos` and `sleep`.

### Key Learnings

#### Scaling the clock preserves semantics

Because relative timing still decides outcomes, a program behaves identically at
any speed — only its wall-clock duration changes. The tests assert this directly:
a race between a 1s and a 2s sleep picks the same winner at rate 1, 0.5 and 0.25,
and a `timeout` still fires. This is the property a UI-level replay could never
offer, and it is the whole argument for instrumenting the runtime.

#### Elapsed virtual time is speed-invariant

`Clock.currentTimeMillis` reads virtual time, so a program measuring its own
`Effect.sleep("1 second")` sees 1000ms whether that took 1s or 4s of wall time.
Trace timestamps taken from the clock will therefore be stable across speeds, and
the timeline will not redraw itself when the user moves the speed combo.

#### `sleep` must return its canceler

`Effect.async` takes an optional canceler effect, which the runtime runs on
interruption. Returning the `VirtualClock`'s cancel function there is what stops
an interrupted fiber from leaving a timer pending — which matters because the
stepper reads `pendingCount` to decide whether the world can still make progress.

### What this unlocks

Slow motion is real from here: providing this layer makes every `Effect.sleep`,
`Schedule` delay, `timeout` and `race` in a program run at the chosen rate, and
rate 0 genuinely freezes them.

## Step 3: Date shim in the WebContainer ✅

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/dateShim.ts` | `installDateShim(virtualClock)` → uninstall function |
| `src/runtime/dateShim.test.ts` | 13 tests |
| `src/runtime/index.ts` | Export `_installDateShim`, `_VirtualClock`, `_makeVizClockLayer` |
| `src/services/webcontainer.ts` | `RUNNER_JS` creates the clock, installs the shim, provides the clock layer |

Effect's own notion of time already comes from the `Clock`, but code calling
`Date.now()` directly bypasses it and would keep reading wall time while
everything around it ran slowly. The shim closes that gap — in the container
only, since the in-browser fallback shares a realm with React and patching `Date`
there would distort the UI's own animations.

### Key Learnings

#### A Proxy, not a subclass

The obvious implementation is `class ShimmedDate extends Date`, but a class
cannot be called without `new`, and `Date()` without `new` is legal JavaScript
that returns a string. Proxying the real `Date` keeps that working, and gets
`instanceof`, `Date.parse`, `Date.UTC` and the whole prototype for free because
the target is the genuine constructor.

Only two behaviours change: `Date.now()` and the zero-argument `new Date()`.
Every explicit form is passed straight through — which matters because Effect
itself builds log timestamps with `new Date(clock.unsafeCurrentTimeMillis())`.

#### Only one ordering constraint remains

`runner.js` imports `runtime.js` statically and loads the user's program with a
*dynamic* `await import()`, so `main()` can install the shim in between: the
program module then evaluates and sees virtual time from its first statement. Had
the program been a static import it would have initialised before the shim landed
and captured the real `Date`.

That constraint is inherent — a shim only affects code evaluated after it. The
*second* constraint this originally had, that the clock must capture `Date.now`
before being shimmed, was removed by having the clock read `performance` instead.

#### Trace timestamps became virtual for free

Every emit site hardcodes `timestamp: Date.now()` — in `traceEmitter`,
`vizTracer`, `vizSupervisor` and `runProgram`. All of that code runs inside the
container, so the shim converts them without a single edit: a program's recorded
trace now spans the same virtual duration whatever the speed, and the timeline
will not redraw itself when the user changes the combo. Verified by running the
built bundle at three rates: wall time scaled as expected, while the trace span,
and any `Date.now()` the program read, stayed constant.

The fallback path has no shim by design, so its timestamps remain wall time.
That asymmetry is a decision for step 5.

#### `RUNNER_JS` is a string, so the logic lives in the bundle

The runner cannot be typechecked or unit-tested — it is a template literal
mounted into the container. Keeping it to a few calls into `runtime.js` means
everything of substance is testable in `src/runtime`, and the string stays thin
enough to read.

### What this unlocks

A container whose entire notion of time — Effect's and raw JavaScript's — is under
our control, with speed-invariant trace timestamps. The rate is read from a
`VIZ_RATE` environment variable at spawn (defaulting to 1); step 5 supplies the
value from the UI.
