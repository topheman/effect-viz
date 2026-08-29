# The original hand-made demo, step by step

A frame-by-frame reconstruction of the 53s screen recording linked from the root
README, extracted at 0.5s granularity. It is the reference the scripted scenario
in `scenario.ts` is built against.

Source: `https://github.com/user-attachments/assets/c6073f78-d18e-4573-805b-65b1c2a71df8`
(3024x1964, 60fps, 53.15s, recorded against `effect-viz.vercel.app`).

## Steps

| Time       | Who  | Step                                                                                                                                                                                   |
| ---------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.0–2.0    | user | Pointer drifts from the Fiber Tree down into the console panel and parks on the last boot line.                                                                                        |
| 0.0–6.5    | app  | WebContainer boots. Log runs `3/6 runtime.js fetched` → `4/6 Files mounted` → `5/6 Running pnpm install...` → `pnpm install finished {"exitCode":0}` → `6/6 Boot complete` → `ready`.  |
| 2.0–6.5    | user | Pointer held still for ~4.5s. The presenter simply waits and lets the boot log be read.                                                                                                |
| 6.5        | app  | Run button enables. The red type-error squiggle under `"effect"` on line 1 clears as Monaco acquires types (`Types acquired` at 7.0).                                                  |
| 7.0–7.5    | user | Move to the Run button; its `Run` tooltip appears.                                                                                                                                     |
| 7.5–8.0    | user | **Click Run.** Idle → `Starting...`                                                                                                                                                    |
| 9.0–10.5   | app  | Basic Example runs. `#0` forks `#6` and `#7`; log streams rows `[4]`→`[30]`; three Timeline lanes fill to ~1.5s. Console prints `All workers done!` then `Program completed: { … }`.   |
| 10.5–11.5  | user | Move up to the horizontal splitter between the cards row and the Timeline; the cursor becomes `↕` and the splitter highlights.                                                        |
| 11.5–13.0  | user | **Drag the splitter up ~58px** (y 628 → 570), enlarging the Timeline so all three fiber lanes fit at once. The Execution Log is clipped as a result.                                   |
| 13.0–13.5  | user | **Open the program dropdown** (native macOS popup, 10 options, `Basic Example` ticked).                                                                                                |
| 14.0–14.5  | user | **Select `Multi-Step Worker`.** Editor swaps to its template; all three visualizer cards reset.                                                                                        |
| 15.0–15.5  | user | **Click Run.**                                                                                                                                                                         |
| 16.5–17.0  | user | **Click into the editor**, line 6, placing the caret just inside the closing quote of `"step-1-prepare"`.                                                                              |
| 17.5–18.0  | app  | Run finishes. The log still shows the original span names.                                                                                                                             |
| 18.0–19.0  | user | **Add a caret below, twice** (keyboard — the pointer is not drawn). Carets land at the same column on lines 6, 7 and 8; all three span names are 14 characters, so the columns align.  |
| 19.5–20.0  | user | **Type `!!`** at all three carets at once. See [Code edits](#code-edits).                                                                                                              |
| 20.5–21.0  | user | **Click Run.**                                                                                                                                                                         |
| 22.0–24.0  | app  | The run streams the edited names: `effect:started step-1-prepare!!`, `effect:ended step-2-process!!`, `effect:started step-3-cleanup!!`.                                               |
| 24.0–25.0  | user | Pointer sweeps across the Execution Log rows, reading the renamed spans. No click — this beat exists purely to point at the payoff of the edit.                                        |
| 25.5–26.0  | user | **Open the dropdown** again.                                                                                                                                                           |
| 26.0–27.5  | user | Highlight walks down to `Nested Forks`; **selected** between 27.0 and 27.5.                                                                                                            |
| 27.5–28.0  | user | **Click Run.**                                                                                                                                                                         |
| 29.0–30.0  | app  | Nested Forks runs. Fiber Tree nests four deep: `#0` → `#6` → `#7` → `#8`. Console prints `Program completed: parent done`.                                                             |
| 30.0–32.0  | user | **Hover identifiers for their types.** `parent` → `const parent: Fiber.RuntimeFiber<string, never>`, then `child` → `const child: Fiber.RuntimeFiber<string, never>`.                  |
| 33.5–34.0  | user | **Open the dropdown** a third time.                                                                                                                                                    |
| 34.0–35.0  | user | Highlight walks `Nested Forks` → `Failure & Recovery` → `Retry (Exponential Backoff)`.                                                                                                 |
| 35.0–35.5  | user | **Select `Retry (Exponential Backoff)`.**                                                                                                                                              |
| 36.5–37.0  | user | **Click Run.**                                                                                                                                                                         |
| 38.0–39.5  | app  | The retry run succeeds. Four `retry:attempt` rows, with resumes after 101ms, 209ms, 410ms and 812ms — the backoff doubling is visible both in the log and as widening Timeline gaps.   |
| 38.5–39.0  | user | **Hover `flakyEffect`** → `const flakyEffect: Effect.Effect<string, Error, never>`.                                                                                                    |
| 40.0–40.5  | user | **Click into the editor**, line 13, caret just after the word `failed`.                                                                                                                |
| 41.0–41.5  | user | **Type ` 💣💥💨`** into the error message.                                                                                                                                             |
| 42.0–43.0  | user | **Scroll the editor** down ~4.5 lines to bring `Schedule.recurs(5)` into view. Monaco's sticky scroll pins line 5.                                                                     |
| 43.5–44.0  | user | **Double-click the `5`** in `Schedule.recurs(5)` to select it.                                                                                                                         |
| 44.5–45.5  | user | **Type `3`** over the selection.                                                                                                                                                       |
| 46.0–46.5  | user | **Click Run.**                                                                                                                                                                         |
| 47.5–48.5  | app  | **The program now fails.** `[interrupted] #0` in red, a red segment closing the Timeline bar, `[12] ❌ effect:ended flaky-task` and `[13] ⛔ fiber:interrupted #0`, and a stack trace. |
| 49.5–50.5  | user | Move to the ⓘ icon; `About` tooltip appears.                                                                                                                                           |
| 50.5–51.0  | user | **Click ⓘ.** The info modal opens.                                                                                                                                                     |
| 51.0–53.15 | —    | The video ends with the modal open.                                                                                                                                                    |

## Code edits

Three edits across two programs. Each is followed by a re-run, and in every case
the point is that the change shows up in the runtime output.

**Multi-Step Worker, t=20.0** — one multi-caret edit across three lines:

```diff
-      yield* Effect.withSpan("step-1-prepare")(Effect.sleep("500 millis"));
-      yield* Effect.withSpan("step-2-process")(Effect.sleep("500 millis"));
-      yield* Effect.withSpan("step-3-cleanup")(Effect.sleep("500 millis"));
+      yield* Effect.withSpan("step-1-prepare!!")(Effect.sleep("500 millis"));
+      yield* Effect.withSpan("step-2-process!!")(Effect.sleep("500 millis"));
+      yield* Effect.withSpan("step-3-cleanup!!")(Effect.sleep("500 millis"));
```

**Retry (Exponential Backoff), t=41.5** — decorate the failure message:

```diff
-      return yield* Effect.fail(new Error(`Attempt ${n} failed`));
+      return yield* Effect.fail(new Error(`Attempt ${n} failed 💣💥💨`));
```

**Retry (Exponential Backoff), t=45.5** — the edit that breaks the program:

```diff
-    Schedule.recurs(5),
+    Schedule.recurs(3),
```

`flakyEffect` only succeeds once `n >= 5`, and `if (n < 5)` is left untouched, so
cutting the schedule to three retries means four attempts and a guaranteed
failure. That is the whole point of the last act: an edit to the retry policy
flips a green run red, and the visualizer shows exactly where.

## What the demo is actually arguing

Three claims, in order, each proven by running something:

1. **The runtime is observable.** One click on Run and the fiber tree, event log
   and timeline all fill in together.
2. **The programs are live, not screenshots.** Edit a span name, re-run, and the
   new name comes back out of the runtime in the event log.
3. **You can break things and see why.** Change a retry policy, re-run, and the
   failure is legible across all three views at once.

Everything else — the panel drag, the type-hover tooltips, the walk across the
log rows — is pacing, giving the viewer somewhere to look while a program runs.

## Coverage by the scripted scenario

`scenario.ts` reproduces every act of this demo, plus controls that postdate it
(speed, pause, step, reset). Three deliberate departures:

- **The open dropdown** (13.0, 25.5, 33.5) is not reproduced. It is a native
  `<select>`, so macOS draws the popup outside the page and a browser capture
  cannot see it. The switch still reads, through the picker label and the code.
- **The rename targets one span, not three.** The original suffixes all three
  Multi-Step Worker spans at once with a multi-caret edit. The script renames
  `worker-1-task` to `worker-1-job` in the Basic Example instead, which makes the
  same point in one program and leaves the untouched `worker-2-task` on screen
  as a control.
- **The emoji edit is dropped**, for time. `Schedule.recurs(5)` →
  `recurs(3)` and the failing run it causes are reproduced in full.
