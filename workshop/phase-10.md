# Phase 10: Slow Mode and Stepper (issue #13)

**Status**: ✅ COMPLETE — all steps done. Follow-up work continues in [#18](https://github.com/topheman/effect-viz/issues/18) (Effect upgrade + trace audit)

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
| 3b | Virtual timestamps at every emit site | ✅ |
| 4a | Gated `Scheduler` + step ladder | ✅ |
| 4b | Control channel for the WebContainer | ✅ |
| 5a | UI: speed combo + playback state matrix | ✅ |
| 5b | UI: ⏯️ ⏭️ stepper controls (fallback path) | ✅ |
| 6 | Example programs + explainers | ✅ |
| 7 | Tag instrumentation events, with a show/hide toggle | ✅ |

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

## Step 3b: Virtual timestamps at every emit site ✅

The shim made container trace timestamps virtual as a *side effect* of a global
patch, and left the fallback path on wall time. Both paths now read virtual time
explicitly, so neither depends on the shim for correctness — the shim is back to
doing only its real job, serving user code that reaches for `Date` directly.

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/virtualClock.ts` | Export the `Now` type |
| `src/runtime/traceEmitter.ts` | 5 sites → `Clock.currentTimeMillis` |
| `src/runtime/vizTracer.ts` | 2 sites → the runtime-supplied span times |
| `src/runtime/vizSupervisor.ts` | 4 sites → injected `Now` |
| `src/runtime/runProgram.ts` | 3 sites → injected `Now` |
| `src/hooks/useEventHandlers.ts` | Fallback builds its own clock and provides the clock layer |
| `src/services/webcontainer.ts` | `RUNNER_JS` passes `now`; prewarm import fixed |

### Key Learnings

#### Only half the sites needed injecting

Of the fourteen `Date.now()` calls, seven could read virtual time from something
they already had:

- **`traceEmitter.ts`** runs inside `Effect.gen`, so `Clock.currentTimeMillis` is
  available directly. `Clock` is a default service, so this adds nothing to the R
  channel and no signature changed.
- **`vizTracer.ts`** was ignoring parameters the runtime already passes.
  `internal/core-effect.ts` builds span times with `clock.unsafeCurrentTimeNanos()`
  and hands them to `tracer.span(...)` and `span.end(...)` — already virtual. We
  were discarding them and calling `Date.now()` instead.

Only the `Supervisor` callbacks and `runProgramFork` are genuinely outside any
Effect context, and those take the injected `Now`.

#### Nanosecond epochs do not fit in a double

Span times arrive as BigInt nanoseconds. An epoch in nanoseconds is around
1.8 × 10¹⁸, well past `Number.MAX_SAFE_INTEGER`, so converting before dividing
loses precision. Dividing as BigInt first and converting after keeps the result
exact.

#### The prewarm program had been silently broken

`PREWARM_PROGRAM` imported `runProgramFork`, but the runtime bundle has exported
it as `_runProgramFork` since the phase 9 rename. That is a link-time error, so
the pre-warm spawn had been failing since then — invisibly, because it is forked
and spawned with `output: false`. Found while updating the call sites.

### What this unlocks

Both execution paths record virtual time, so a trace spans the same duration
whatever speed it was captured at — verified by running a program with a forked
child, a span and a sleep at three rates: wall time scaled while the recorded
span stayed constant. The fallback path also gains the clock layer, fixed at
rate 1 until the speed control is wired.

## Step 4a: Gated Scheduler ✅

The `VirtualClock` stretches the gaps a program spends sleeping. It cannot touch
the bursts of work between sleeps, because there is no gap there to stretch — and
those bursts are where forks, races and interruptions happen. Controlling them
means controlling the `Scheduler`.

A fiber that must continue later does not continue itself: the runtime turns the
continuation into a **task** and hands it to the `Scheduler`, which decides when
to run it. `GatedScheduler` takes that decision. While playing it forwards every
task to Effect's own scheduler unchanged. While paused it queues them, and only a
step releases one.

### Key Learnings

#### Forcing a yield while paused deadlocks the stepper

It looked worthwhile to answer `shouldYield` with "yes" while paused, so a fiber
would stop at its next operation rather than after Effect's default of 2048. It
makes no progress possible at all: the released fiber asks `shouldYield` before
doing any work, is told to yield, re-queues itself, and every step releases that
same task forever. The queue count sits at 1 and nothing happens.

`shouldYield` now defers to Effect in both modes. Pausing therefore takes effect
at the runtime's own yield points — which is also where the program is in a
consistent state.

#### One task is not one visible step

The first released task is often runtime bookkeeping — building a `Layer`,
closing a scope — and not user code. A step button wired straight to "release one
task" would appear to do nothing at random moments.

So "release one task" stays the internal primitive, and the button uses
`releaseUntil(predicate)`: release until something visible has happened. The
caller supplies what counts, normally "one more trace event has been emitted". A
`maxTasks` bound stops a predicate that never comes true from running the whole
program on one click.

#### A pause takes hold within one scheduler turn

Tasks already handed to Effect's scheduler still run — they are out of our hands.
Anything *they* schedule is queued. So the program stops a moment after Pause is
pressed, not instantly.

#### The ladder needs both sources, in order

`Stepper` owns the `GatedScheduler` and the `VirtualClock` and answers one
question: what happens when the user clicks step.

1. Queued work exists → release until one more trace event is emitted.
2. Nothing runnable, a deadline pending → move virtual time to it, then release.
3. Neither, and the program has not finished → no progress.
4. The program has finished → done.

A fiber that can run now must run before time is allowed to move, otherwise a
step would skip past work that was already due.

#### The timeline must read the clock, not model it

The live cursor was computed by extrapolating from the run's rate: anchor the
first event, then add wall time multiplied by the rate. That is correct only
while the clock runs freely. A paused clock kept extrapolating, so the timeline
grew a bar to eight seconds for a program that was frozen with two events on it,
and a step moved virtual time in a jump the extrapolation could not see.

The in-browser path holds the clock, so the store now reads it directly and only
falls back to extrapolation for the WebContainer, where the program runs in
another process and cannot be paused anyway.

#### Pause has to stop the clock as well as the scheduler

Gating the scheduler stops fibers from running, but virtual time keeps advancing
on its own. A program paused for seven seconds then reported `fiber:resume #104
(after 7.83s)` for a one-second sleep, and the timeline scaled to eight seconds:
the user's reading time had been recorded as part of the program's own elapsed
time.

So a pause sets the rate to 0 and resume restores the previous rate, which also
re-arms parked timers with the virtual time they had left. Unit tests missed this
because they never let wall time pass between pausing and stepping — only using
the app surfaced it.

#### A step needs a turn of the event loop to settle

Part of a fiber's completion lands outside our scheduler, and a microtask is not
enough — it needs a full turn. Two steps in a row without yielding report
`noProgress` for a program that has in fact just finished. Every click in the UI
is its own turn, so this only bites loops, including test helpers.

#### Stepping reproduces the real interleaving

The design choice was to never pick which fiber advances, only when to stop
releasing. That is only worth anything if releasing in queue order gives the same
execution as running at full speed. A test now runs a program with three forked
workers twice — once played, once stepped to the end — and compares the event
order. They match.

#### A paused program cannot be interrupted

Interruption reaches a fiber as a task, like everything else. So while the
scheduler is gated, `Fiber.interrupt` never completes — it simply queues. The
Reset button must therefore call `play()` before it interrupts, or it will hang.

The same mechanism is a feature elsewhere: a promise that settles during a pause
also queues, so external work cannot slip past the user between two steps.

#### Detecting a stuck program needs no internals

`fiber.status` carries `blockingOn`, which would separate a deadlock from a wait
on the network. But it is an `Effect`, and reading it sends the fiber a message
that the fiber must process — which needs the scheduler that we are gating. So it
cannot be read while paused.

Three counts we own are enough to detect that a program cannot move at all: tasks
in the gated queue, tasks in flight with the inner scheduler, and pending timers
on the `VirtualClock`. With all three at zero and the root fiber still running,
nothing can happen without help. That is reported as "no progress" rather than
guessing between a deadlock and a slow network reply.

## Step 5b: Stepper controls ✅

Pause, resume and step are wired to the buttons on the in-browser path, which
holds the `Stepper` directly. The WebContainer path leaves them disabled here;
step 4b gives it a channel to reach the same three verbs in another process.

### Key Learnings

#### A step is at least one event, not exactly one

One scheduling decision resumes a fiber, which runs to its next yield point and
may emit several trace events on the way. In the Basic Example each click
advances the log by about four entries. That is the intended meaning of a step —
one decision by the runtime — rather than one line of output.

#### `PauseReason` lost a value it could not produce

It began as `user | deadlock | waiting-external`, but the ladder can only tell
that nothing is runnable, not why. It is now `user | stuck`, and the tooltip says
"deadlocked, or waiting on something outside" rather than choosing.

#### An interrupted run settles like a completed one

`runFallbackPlay` catches the rejection and returns a value, so a run that is
interrupted resolves exactly as a run that finished. While both branches set the
same state this was invisible; once completion started reporting `finished`,
Reset began reporting `finished` too.

Both this and the next entry are fixed by a run identifier: the run records its
id when it starts, Reset increments the id, and anything settling for an id that
is no longer current is ignored.

#### Reset left the interrupt's own events in the log

`clearEvents()` runs immediately, but interrupting a fiber emits trace events of
its own, and those arrive afterwards. Reset therefore emptied the log and then
refilled it with the interruption. The emit path now drops events belonging to a
superseded run.

## Step 5a: Speed control ✅

Issue #13's actual request, clickable. Selecting a speed and pressing Play runs
the program with its clock scaled by that factor.

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/hooks/useSpeed.ts` | `SPEED_OPTIONS`, `useSpeed` (localStorage-backed), `formatSpeed` |
| `src/components/layout/PlaybackControls.tsx` | Speed `Select`, `PauseReason`, corrected enable/disable rules |
| `src/components/layout/MainLayout.tsx` | Speed state; `finished` on completion |
| `src/hooks/useEventHandlers.ts` | `rate` through to both paths |
| `src/hooks/useWebContainerBoot.ts`, `src/effects/spawnAndParse.ts` | `VIZ_RATE` spawn environment variable |

### The playback state model

Playback has two independent dimensions, which the original single enum mixed
together. **Lifecycle** is `idle → starting → running → paused → finished`;
**readiness** (`isPlayDisabled` while the container boots, `isSyncing` while the
editor flushes) is orthogonal and can coincide with any of them.

| | ⏯️ | ⏭️ | ↺ | Speed |
|---|---|---|---|---|
| `idle` + booting | – | – | – | ✓ |
| `idle` ready | ✓ | ✓ (starts paused) | – | ✓ |
| `starting` | – | – | ✓ | – |
| `running` | ✓ (pause) | – | ✓ | – |
| `paused` | ✓ (resume) | ✓ | ✓ | ✓ |
| `finished` | ✓ (re-run) | – | ✓ | ✓ |

Speed is locked while running because the WebContainer receives the rate as a
spawn environment variable and cannot be retuned without restarting. That is a
temporary limitation: pausing the container will require a host→container control
channel anyway, and once it exists the rate can travel the same way.

⏭️ is enabled at `idle` because there is otherwise no way *into* a paused run:
Play starts a free-running program, and by the time the user pauses it, the
opening events have gone. Step from `idle` starts the program already gated. It
stays disabled while `running` — stepping remains a pause-mode operation.

Gating alone does not catch the very first events, because `Effect.runFork` runs
a fiber synchronously until its first yield and the scheduler only governs
resumption. A paused start therefore yields before the program body, which hands
the first operation to the gate. The cost is one extra suspend/resume pair in the
trace, present only on a paused start.

`paused` carries a reason — `user`, `deadlock` or `waiting-external` — because
only a user pause can be stepped. The other two mean the runtime has nothing left
to release, which is the stepper ladder's rungs 3 and 4 surfacing in the UI.

### Key Learnings

#### Two bugs the matrix exposed

Step was enabled in `idle`, a leftover from when stepping walked a recorded event
log; in the runtime model there is nothing to step until a program is live. And
a completed run returned to `idle` rather than `finished`, so the `finished`
state was unreachable and Reset was offered when there was nothing to reset.

### Two bugs found by using it

**The timeline mixed clocks.** Its live cursor read wall time while every event
timestamp is virtual, so during a run at 0.25x the elapsed grew four times too
fast, and the moment the run ended it switched to the last event's timestamp and
snapped back to the true span. The host cannot see the container's clock, so it
keeps a mirror: the rate it chose, anchored on the first event's timestamp and
the wall time at which that event arrived.

**The axis tick interval was capped at one second**, so any long span rendered a
label per second until they overlapped into an unreadable smear. It now rounds up
to the nearest 1, 2 or 5 times a power of ten, keeping the label count bounded at
any magnitude. Independent of the clock bug — exponential backoff at 0.25x would
have hit it — but the clock bug is what made it visible.

Both are pure functions in `src/lib/timelineTime.ts`, unit tested. The Execution
Log needed no change: it derives durations from event timestamps alone, so it was
already reporting program time.

### Verification

Driven in a real browser on the fallback path. At each speed the program's
virtual duration stayed constant while wall time scaled by exactly the expected
factor — 1×, 2× and 4× — confirming that the clock reaches the program and that
the recorded trace is speed-invariant. Speed locks while running, unlocks after,
and survives a reload.

The WebContainer path could not be exercised in the automation browser, which is
not cross-origin isolated and therefore cannot boot a container; its runner logic
was verified separately against the built runtime bundle under Node.

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

---

## Step 4b: Control channel for the WebContainer ✅

Pause, resume and step reached the runtime by a method call on the in-browser
path, and by nothing at all on the WebContainer path — the program runs in
another process, so the controls were simply disabled there. That was the wrong
way round: the container is the path most people use.

The three verbs now travel as messages. Commands go in on the process's stdin as
one JSON object per line; replies come back on stdout behind a `TRACE_CONTROL:`
prefix, alongside the `TRACE_EVENT:` lines that were already there.

### What the wire looks like

Both directions share the process's stdio, so it helps to read a run as a
conversation. Below, ⬇️ is the page writing a command to the process's **stdin**,
and ⬆️ is the process writing back on its **stdout**. This is a real transcript of
a program that logs a line and then sleeps for two seconds, started paused and
stepped through (span ids shortened).

```text
⬆️ TRACE_CONTROL:{"reply":"ready","virtualNow":1787609740816.87}
⬆️ TRACE_EVENT:{"type":"fiber:fork","fiberId":"#0","timestamp":1787609740816.87}
⬆️ TRACE_EVENT:{"type":"fiber:suspend","fiberId":"#0","timestamp":1787609740816.87}

⬇️ {"cmd":"step"}
⬆️ TRACE_EVENT:{"type":"fiber:resume","fiberId":"#0","timestamp":1787609740816.87}
⬆️ TRACE_EVENT:{"type":"effect:start","label":"greet","id":"9273ed06","timestamp":1787609740816}
⬆️ hello from the program
⬆️ TRACE_EVENT:{"type":"effect:end","id":"9273ed06","result":"success","timestamp":1787609740816}
⬆️ TRACE_EVENT:{"type":"fiber:suspend","fiberId":"#0","timestamp":1787609740816.87}
⬆️ TRACE_CONTROL:{"reply":"step","virtualNow":1787609740816.87,"outcome":{"_tag":"released","tasks":1}}

⬇️ {"cmd":"step"}
⬆️ TRACE_EVENT:{"type":"fiber:resume","fiberId":"#0","timestamp":1787609742816.87}
⬆️ TRACE_CONTROL:{"reply":"step","virtualNow":1787609742816.87,"outcome":{"_tag":"advancedClock","toVirtual":1787609742816.87,"tasks":1}}
⬆️ TRACE_EVENT:{"type":"fiber:end","fiberId":"#0","timestamp":1787609742816.87}
⬆️ Program completed: done

⬇️ {"cmd":"step"}
```

Four things are worth reading out of it.

**The upward channel is shared, the downward one is not.** Three kinds of line
come back — trace events, control replies, and `hello from the program`, which is
the program's own `console.log`. WebContainer merges a process's stdout and stderr
into a single output stream, so a reader has to sort them, and only the
machine-readable kinds are prefixed. Nothing but the page writes to stdin, so a
command travels as bare JSON.

**A step is answered after its consequences.** Every event a step produces is
written before the reply that accounts for it, because the runner emits them
synchronously inside the step. By the time the page snaps its clock model to a
reply's reading, it has already received every event that reading covers — the
correction can never arrive ahead of what it is correcting.

**The clock jump is visible.** Across the second step the timestamps move from
`…740816` to `…742816`, the full two seconds of the sleep, while the user spent a
moment between clicks. That is the `advancedClock` rung of the ladder, and the
reason a reply carries `virtualNow` at all: no extrapolation from the run's rate
could have produced that jump.

**The last command goes nowhere.** The program finished during the second step, so
the process released its stdin listener and exited; the third command was written
into a closed pipe. That is the ordinary end of every run rather than an error
case, which is why the writer discards write failures and the scope's release
settles any step still waiting with a null outcome.

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/runtime/controlChannel.ts` | Command and reply codecs, `applyCommand`, `makeLineReader` |
| `src/runtime/controlChannel.test.ts` | 35 tests |
| `src/lib/mirroredClock.ts` | The page's model of the container's clock |
| `src/lib/mirroredClock.test.ts` | 7 tests |
| `src/lib/containerController.ts` | Turns clicks into commands, resolves a step on its reply |
| `src/lib/containerController.test.ts` | 7 tests |
| `src/services/webcontainer.ts` | `RUNNER_JS` builds the scheduler and stepper, reads stdin, writes replies |
| `src/effects/spawnAndParse.ts` | `TRACE_CONTROL:` branch, writes to `proc.input`, `VIZ_START_PAUSED` |
| `src/hooks/useEventHandlers.ts` | One pair of handlers for both paths; a step is a promise on each |
| `src/components/layout/PlaybackControls.tsx` | `isSteppingSupported` removed — every path supports it now |

### Key Learnings

#### The reply is what makes a step legible, not a nicety

A `StepOutcome` is what tells the user a program is stuck rather than merely
slow, so the channel needs a return path for that alone. But every reply also
carries the container's virtual clock reading, and that turns out to be
load-bearing for the timeline.

The page draws a cursor in the gaps between events, and on this path it can only
model the container's clock rather than read it. Extrapolating from the run's
rate is fine while a program runs freely. It is hopeless across a step, as the
transcript above shows: a step over a sleep moves the container's clock by the
whole sleep in one go, while barely any wall time passes. Without the reading in
the reply the cursor would sit still and the next event would arrive stamped
seconds ahead of it.

#### The model is a predictor, not a second clock

The container's clock stays the only clock — it is what `Effect.sleep` counts
down in and what stamps every event. `MirroredClock` extrapolates between
authoritative readings and snaps on each one, and it gets two kinds: the
timestamp on every trace event, and the `virtualNow` on every control reply. Both
sides read the same monotonic hardware source, so the two never tick at different
speeds; the error is an offset of roughly one message latency, and snapping keeps
it from accumulating.

Two rules make the snapping safe. Corrections only ever move the cursor forward,
because a reading is always slightly stale by the time it arrives — one that
lands behind the prediction means the page ran ahead, not that time went
backwards, and a playhead that rewinds reads as a bug. And the model re-anchors
before its rate changes, or the elapsed interval gets re-read at a rate that was
never in effect for it.

That asymmetry also decides when the model follows a command. It freezes on the
click, so the cursor stops when the user expects; it resumes on the *reply*,
because a model resumed early would run ahead of the container for the rest of
the run, and forward-only corrections would never pull it back.

#### stdin is the keep-alive, which is why it has to be released

A listener on `process.stdin` refs Node's event loop. That is a problem and a
solution at once. Without the release the process would never exit, because
nothing else keeps it open once a program finishes; the listener is removed when
the root promise settles. But it also cannot simply be unref'd, because a *paused*
program has no task running and no timer armed — while the gate is closed, that
listener is the only thing holding the process open at all.

#### Speed stayed off the wire

The protocol could carry a rate, but the fallback path fixes speed for the life
of a run, and the container reads it once from `VIZ_RATE` at spawn. Putting a live
rate command on the channel would give one path a capability the other does not
have, for a control the UI presents as identical on both. It stays a spawn-time
decision.

#### Step from idle had to learn to flush

Step doubles as "start this program paused", and on the container path a run must
be preceded by flushing the editor's contents. Play already did that; Step never
had to, because it had only ever run in the browser, where there is nothing to
sync. Without it, a stepped run would walk through whatever the container was
last given rather than what is on screen.

### Verification

The runner is a template literal, so it cannot be typechecked or unit tested. It
was exercised by extracting the real string, running it under Node against the
built runtime bundle, and driving its stdin the way the page does.

Stepping a program with a five second sleep produced the ladder in order: queued
work released one visible chunk at a time, then the rung that moves the clock,
reported as `advancedClock` with the jump in the reply. Pausing a free-running
program for a second and a half left no trace in the program's own timeline —
the run's virtual span came out the same as an unpaused one, because the clock
stopped with the scheduler. Both runs exited cleanly, which is the check that
the stdin listener is being released.

WebContainer itself could not be booted in the automation browser, which lacks
cross-origin isolation and so has no `SharedArrayBuffer`, leaving one link
uncovered: whether writes to `proc.input` arrive at the container process's
`process.stdin`. That was closed by hand in a real browser — Step from idle on
the container path starts the run gated and reports the root fork and the
injected yield's suspend, which only happens if the command arrived.

### What this unlocks

Slow motion, pause and step on the path the app actually runs, which is what
step 6's examples need to be worth writing.

It also settles a question step 7 had left open. The channel opens with a `ready`
handshake, which was expected to need tagging as an instrumentation event — but
replies are consumed where stdout is demultiplexed and never reach the trace
store, so there is nothing to hide. What the channel did add is of a different
kind: the terminal echoes every command back as console output.

## Step 7: Origin tagging and the internals toggle ✅

Two things in the visualizer are the tool talking rather than the program, and
both were showing up as though the program had done them.

A paused start injects `Effect.yieldNow()` before the program body, so that the
very first operation is handed to the gate rather than running on the fork's own
stack. The runtime yields for real, so the Supervisor emits a `fiber:suspend` and
a matching `fiber:resume (after 0ms)` that the program's author never wrote. The
same program therefore reads slightly differently depending on whether it was
started with Play or with Step. For the Basic Example, the marked lines are the
injected yield:

```diff
[1] ⚡fiber:forked #2 (root)
+ [2] ⏸️fiber:suspend #2
+ [3] ▶️fiber:resume #2 (after 0ms)
[4] 🚀effect:started initialization
[5] ✅effect:ended initialization
```

`[2]` is the yield handing control back, `[3]` is the same yield returning once
the first step releases it. It reads `after 0ms` because virtual time is frozen
while paused, however long the user takes.

The second is in the console rather than the trace. Every WebContainer process
has a pseudoterminal attached, and a terminal echoes what is written to it, so
each `{"cmd":"step"}` the page sends comes straight back on the process's output
and lands in the log as though the program had printed it.

Rather than choose between leaving them visible and filtering them away, both are
tagged and the user decides.

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/types/trace.ts` | `TraceOrigin`, `TraceEvent & { origin? }`, `isToolEvent` |
| `src/runtime/traceOrigin.ts` | `makeOriginTagger` — finds the injected yield |
| `src/runtime/traceOrigin.test.ts` | 7 tests |
| `src/hooks/useShowInternals.ts` | One preference, shared by both panels |
| `src/effects/spawnAndParse.ts` | `onStdout` gains an origin; echoed commands classified |
| `src/components/visualizer/ExecutionLog.tsx` | Filter, toggle, dimmed tool rows |
| `src/components/editor/WebContainerLogsPanel.tsx` | Filter and toggle for control lines |

### Key Learnings

#### Position identifies the yield, because nothing in the event does

A yield is a yield: the pair the injection produces is indistinguishable from one
the program earned, and the Supervisor reports both the same way. What we do know
is where it sits — it is the first thing the root fiber does, because we put it
there.

So the tagger is a small state machine over the emit path. It learns the root's
id from the first `fiber:fork` (the two runtimes number fibers differently, so it
cannot be hardcoded), expects a suspend from that fiber, then its resume, and
disarms. Anything else from the root — or any event naming no fiber at all, which
means the program is already working — disarms it too, so a suspend the program
earned is never hidden. A run started with Play arms nothing.

#### Absent means the program's

`origin` is optional and only ever set to `"tool"`. Every existing emit site, test
and fixture keeps working untouched, and the common case stays unannotated. The
filter asks `origin === "tool"`, so anything unrecognised is shown rather than
hidden — the safe direction for a filter whose job is to hide things.

#### The echo classifies itself

Nothing else writes to that process's stdin, so a console line that `decodeCommand`
accepts is one we sent. No heuristics, and no need for a second prefix on the way
down.

#### One preference, two panels

The Execution Log and the console ask independently but must agree, so the
preference lives outside React in a module-level store read through
`useSyncExternalStore`. From the user's side it is one question — am I looking at
my program, or at the tool — and two checkboxes for it would have been two ways to
ask the same thing.

The Timeline and Fiber Tree still consume everything. A suspend that genuinely
happened belongs on a timeline whoever caused it, and a fiber tree with a hole in
it would be worse than one showing an extra yield.

### Verification

Running the built runner under Node against the same program, once started paused
and once with Play, gives traces that differ only by the tagged pair: the paused
run marks the first suspend and resume `tool` and leaves the program's own sleep
pairs alone, and the Play run tags nothing because nothing was injected.

### What this unlocks

A trace that reads the same however the run was started, and a console showing the
program's output rather than the protocol — with both available to anyone who
wants to see how the visualizer works. That last part is worth keeping for step 6:
turning the internals on and stepping is the clearest explanation of the control
channel the app can give.

## Step 6: Example programs ✅

The ten programs the visualizer shipped with were all sleep-shaped: every fork is
followed straight away by an `Effect.sleep`, so the trace reads fork, fork,
suspend, suspend, wait, resume, resume. That is the speed control's territory —
those programs are already slow, and slowing them further only stretches gaps the
reader could see anyway. The stepper earns its keep in the burst *between* the
sleeps, and no example had one.

Choosing what to add by concept rather than by what would look busy, five things
turned out to be missing outright. `Effect.yieldNow`, `Effect.all`, its
`concurrency` option, `Deferred` and `Effect.timeout` appeared nowhere in the set.
Interruption did appear, but only as `Fiber.interrupt` on two flat siblings in
Racing: a hierarchy was never cancelled, and a finalizer never unwound on anything
but the success path.

| Program | Teaches |
|---------|---------|
| Cooperative Interleaving | Fibers take turns at yield points; concurrency is not parallelism |
| Bounded Concurrency | `Effect.all` with a `concurrency` limit, rather than hand-rolled forks |
| Structured Interruption | Cancelling a parent cancels its children, and finalizers still run |
| Timeout | A deadline read from the same clock the program sleeps on |
| Deadlock | `Deferred`, and what a fiber deadlock is |

### Created/Modified Files

| File | Changes |
|------|---------|
| `src/lib/programs.ts` | Five effects and their registry entries, with the lesson in the code |
| `src/lib/programs.test.ts` | 5 tests asserting each example does what its comments claim |
| `src/lib/programCache.test.ts` | Fixture extended to the new keys |

### Key Learnings

#### The explanation belongs in the program, not beside it

Each entry carries a `description`, and it renders nowhere — so there was no
explainer surface to extend, only one to choose. It stays a label, a few words in
the picker, and the teaching text lives as short comments on the lines it
describes. Someone reading `concurrency: 2` wants to be told there that tasks 3
and 4 wait for 1 and 2; a paragraph in a panel they are not looking at would not
reach them.

#### Every example is written twice

A program exists as a real effect, which the in-browser path runs, and as a source
string, which the editor shows and the container executes. Nothing links them, so
the two can drift silently — and the string is invisible to `tsc`. Writing each
`source` out to a scratch file under `src/` and running the project's own
typecheck over it catches both a syntax slip and an API that has moved. All
fifteen pass.

#### A program that never finishes is a legitimate lesson

Deadlock hangs by design, which felt wrong until it was clear that hanging is the
concept. It is also the first program that can reach the stepper's `noProgress`
outcome: until now the "Nothing can run" pause reason built in step 4a existed
without a single example able to produce it.

### Verification

The tests drive the same layers the app does, on a `VirtualClock` the test
advances, so a program with seconds of sleeping in it runs in milliseconds. They
check the claims the comments make rather than the shape of the output:
interleaving asserts the two fibers alternate step for step, bounded concurrency
asserts the virtual times at which each task reports in fall into three batches
rather than one, structured interruption asserts both children's finalizers ran
along with the parent's, and deadlock asserts the fiber is still unresolved after
ten virtual seconds.

### Known issue: the two paths ran different Effect versions

The Timeout example exposed a drift the other programs never revealed. The
container's `package.json` asked for `"effect": "^3.19.15"`, so it installed
whatever 3.x was current — 3.22.1 at the time — while the in-browser path bundles
the version this repo locks, 3.19.15. The two disagreed about the fiber that loses a
timeout race: on 3.19.15 its exit is an interrupt, on 3.22.1 a success. Since the
Supervisor labels a fiber's end from its exit, the same program traced
`fiber:interrupt` in the browser and `fiber:end` in the container.

Settled by [#17](https://github.com/topheman/effect-viz/pull/17): pinning the
container to the app's own exact version rather than a caret range, so the two
paths cannot drift again — both now run 3.19.15. The upgrade of `effect` itself
to the latest 3.x remains open as separate work in
[#18](https://github.com/topheman/effect-viz/issues/18), where the
trace-behaviour changes between 3.19 and 3.22 will need an audit.
