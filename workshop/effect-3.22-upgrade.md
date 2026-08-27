# Upgrading Effect to 3.22 (issue #18)

The app ran `effect` 3.19.15 on both execution paths. This upgrade moves both to
3.22.1, the latest 3.x, and records what the three intervening minor versions
changed for a program that is *watched* rather than merely run.

## One version, on both paths

The in-browser path bundles the `effect` this repo depends on. The WebContainer
path installs its own copy from npm, from the `package.json` the container mounts
(`PACKAGE_JSON` in `src/services/webcontainer.ts`). Two declarations of the same
dependency is how the Timeout example came to trace differently on the two paths
before [#17](https://github.com/topheman/effect-viz/pull/17), so there is only
one. The container's `package.json` names a constant that Vite fills in at build
time with the version the build itself resolves:

```ts
// vite.config.ts
const effectVersion = createRequire(import.meta.url)("effect/package.json").version
// define: { __EFFECT_VERSION__: JSON.stringify(effectVersion) }
```

The mounted `package.json` therefore asks for the very version the bundle was
built against — the resolved one, not a declared range — so no upgrade can move
one path without the other.

The dependency is also declared as an exact version rather than a caret range.
That is not what holds the two paths together any more — the injected constant
does — but it keeps a build from quietly resolving a newer 3.x than the traces
were checked against, which for a visualizer is a behaviour change rather than a
patch. `src/services/webcontainer.test.ts` holds both properties in place.

## Auditing the trace surfaces

Three minor versions is a lot of runtime to take on faith, so the audit compared
the two versions on the evidence that matters here: the trace each example
program emits.

`Supervisor` and `Tracer` are untouched between 3.19.15 and 3.22.1 — both the
types and their implementations are byte-identical, so the two surfaces the
visualizer hooks into behave the same. What did change is deeper: the fiber
runtime, the scheduler, and `Effect.timeout`.

Rather than read those diffs and guess, every example was run through the app's
own runtime bundle (`dist/runtime/runtime.js`, the file the container loads) under
each version, with span ids and timestamps stripped so the two traces could be
compared line by line. Fourteen of the fifteen examples traced identically, down
to the FiberId numbering.

## The one difference: a timeout's loser now exits as a success

The Timeout example is the exception, and it is the behaviour the issue was
opened for.

`Effect.timeout` races the work against a sleep. When the work wins, the sleep
loses and is interrupted; when the work overruns, the work loses and is
interrupted. Under 3.19.15 both losers ended as interrupted fibers, so the
Supervisor — which reads a fiber's exit to label its end — emitted
`fiber:interrupt` for both.

3.22.1 runs the work side under `Effect.exit` ([#6507](https://github.com/Effect-TS/effect/pull/6507),
released as "disable unhandled error logging for fibers spawned by
`Effect.timeout`"). Interruption of that fiber is now captured as a value, so the
fiber's exit is a *success* and the Supervisor can only report `fiber:end`. The
sleep side is unwrapped and still ends as an interrupt.

The interruption is not lost from the trace: the `slow-task` span still ends as a
failure carrying an `InterruptedException`, which is what the Execution Log shows.
Only the fiber's own end event changed. Both facts are pinned by tests in
`src/lib/programs.test.ts`, so a future version that moves this again will say so
rather than drift quietly.

This is Effect's own account of the run, so the visualizer reports it as given
rather than second-guessing the exit.

## Scheduler: a signature the GatedScheduler does not implement

3.20.0 isolated `AsyncLocalStorage` across fibers by giving `MixedScheduler` a
runner per fiber, which added an optional third argument to `scheduleTask`:

```ts
scheduleTask(task: Task, priority: number, fiber?: RuntimeFiber<unknown, unknown>): void
```

`GatedScheduler` takes two parameters and forwards two, so tasks it passes on
while playing all land on the shared fallback runner — the 3.19 arrangement.
Nothing in the app breaks, because one queue in fork order is exactly what
stepping wants: `gatedScheduler.test.ts` and `stepper.test.ts` drive real
programs through the gate, and both pass unchanged. Worth knowing rather than
fixing, unless a future Effect makes the fiber argument load-bearing.

## Effect LSP

The upgrade also brought in `@effect/language-service`, registered as a
TypeScript plugin in `tsconfig.app.json`. It only runs on the TypeScript
installed in the project, so `.vscode/settings.json` points the editor at the
workspace version; VS Code and Cursor prompt for it on first open.
