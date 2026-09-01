# Phase 11: Changing speed during a run

Phase 10 gave the program a clock we own and a channel to command it, but the
speed control stayed a spawn-time decision: the rate was read once, at startup,
and could not be retuned without restarting the program. This phase puts the
rate on the same wire as pause, resume and step, so it is live in both
directions — a running program can be slowed where it stands, and a paused one
resumes at whatever rate was chosen while it was frozen.

The payoff is educational rather than cosmetic. Slowing a program down is most
useful at the moment you realise you cannot see what is happening, which is
necessarily mid-run; re-running at 0.25x throws away the state you were looking
at when you noticed.

`VIZ_RATE` survives, and still means what it always did: the rate a run *opens*
at. Step-from-idle and the auto-start that follows a speed change on a stopped
program both go through it.

## Design Summary

| Concern | Decision |
|---|---|
| Where the branch lives | `Stepper.setRate`, because pause state is private to it |
| Container transport | A fourth `ControlCommand`, `{ cmd: "setRate", rate }` |
| When the page's model follows | On the reply, not on the click |
| Availability | `canChangeSpeed` is now unconditionally true |

### Pause is rate 0, and that is the whole subtlety

`Stepper.pause()` stashes the clock's rate, sets the clock to zero and gates the
scheduler; `play()` restores the stashed value. Two mechanisms, one state.

A naive `clock.setRate(next)` on a paused program therefore *unpauses the clock*
while the scheduler stays gated. Virtual time would start flowing, `Effect.sleep`
deadlines would come due, and the tasks they queue would land in a gate that
nothing is going to open — a program that looks frozen but is quietly
accumulating due work, and that fires all of it the moment the user resumes.

So `setRate` branches on which state it is in. Paused: write the new rate into
the stash, leave the clock at zero. Running: `clock.setRate`, which re-anchors so
virtual time is continuous and re-arms every pending timer against the new
anchor. The branch belongs on `Stepper` rather than on its callers because the
stash is private to it, and because every caller would otherwise have to know
that pause is implemented as a rate.

### A timer already in flight keeps its virtual deadline

The design rests on a claim `VirtualClock` made but had never been asked to
honour: that a rate change lands cleanly on a timer that is already armed. It
does, because `setRate` re-arms every pending timer against the new anchor. A
sleep 400ms into its second, retuned to 0.25x, still wakes at virtual 1000 — it
just takes 2400 more wall milliseconds to get there instead of 600.

`stepper.test.ts` pins this for a bare `Effect.sleep` and for the deadline
`Effect.timeout` arms behind the scenes, both against the in-process fallback
where the clock is directly assertable.

### The page's model changes slope on the reply

`MirroredClock` is the page's predictor over the clock running in the container,
and its run rate is what it extrapolates at between readings. A rate change is
applied when the container's reply arrives, not when the button is clicked, for
the same reason `resume` is: the container keeps running at the old rate for the
length of a round trip, and corrections only ever move the cursor forward, so a
model that changed slope early would predict ahead of the container permanently.

While paused, only the run rate moves. The cursor stays frozen and picks the new
rate up on resume.

## Created/Modified Files

| File | Changes |
|---|---|
| `src/runtime/stepper.ts` | `setRate(rate)` — the paused/running branch |
| `src/runtime/controlChannel.ts` | `setRate` command and reply; `decodeCommand` learns to carry a payload |
| `src/lib/containerController.ts` | `setRate(rate)` — send only, nothing waits on the outcome |
| `src/lib/mirroredClock.ts` | `setRunRate(rate)`; `#runRate` is no longer `readonly` |
| `src/hooks/useEventHandlers.ts` | `handleSetRate` for both paths; the reply handler follows the mirror |
| `src/lib/playbackAvailability.ts` | `canChangeSpeed` is unconditionally true |
| `src/components/layout/MainLayout.tsx` | `onSpeedChange` retunes a live program instead of scheduling an auto-start |
| `src/components/layout/PlaybackControls.tsx` | A third speed hint: "applies on the next run" is no longer true |

### The codec had to learn about payloads

`setRate` is the first command with anything on it beyond the verb.
`decodeCommand` reconstructed a command by validating `cmd` against a list and
casting a bare `{ cmd }`, which would have silently dropped the rate and left the
container applying `undefined`. It now validates the number as well, and rejects
a `setRate` with a missing, non-numeric or negative rate rather than passing it
to a clock that throws on negatives.

## Playback availability

Speed is now allowed from every state, so the phase-10 table's `–` in the Speed
column for `starting` and `running` no longer holds. What a change *does* depends
on the state: a stopped program is re-run at the new rate after a short debounce
(unchanged from phase 10, and still the only way to give the choice something to
show), and a live one — running or paused — is retuned in place.

## Verification

`stepper.test.ts` covers both branches of `setRate`, the pause/setRate/resume
sequence, and the two in-flight timer cases. `controlChannel.test.ts` round-trips
the command with its payload and checks `applyCommand` against a real `Stepper`
and `VirtualClock` in both states. `mirroredClock.test.ts` covers the re-anchor
and the paused case. `containerController.test.ts` and
`playbackAvailability.test.ts` cover the send and the rule.

No test spawns a container — the runner applies commands through the same
`applyCommand` the tests drive, so the container path is covered piece by piece.
The remaining link, that a `setRate` command actually reaches the container
process and retunes it, was closed by hand in a real browser: the Basic and
Timeout examples were both stepped, and both were played at 0.25x and raised to
1x mid-run, with the timeline picking up the new slope where it stood.

## Out of scope

Step Over — running to the end of the current span rather than stopping at every
event inside it — remains deferred. It touches the step ladder rather than the
clock, and bundling it would have doubled the surface of this change.
