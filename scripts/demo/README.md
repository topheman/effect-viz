# Demo recording

Replays a scripted tour of the app in a real browser and records it as an mp4
for the README: a desktop take, then a phone take, joined with a crossfade.

```sh
npm run playwright:install         # once per machine
npm run build && npm run preview   # in one terminal
npm run demo:record
```

The result lands in `recordings/demo.mp4` (gitignored).

`npm install` brings in the Playwright package but not the browser it drives,
which is a separate few hundred megabytes. `playwright:install` downloads it,
and is kept out of `postinstall` on purpose: only this script and the e2e tests
need a browser, and CI needs neither. Encoding needs `ffmpeg` on the `PATH` as well; without it the
raw `.webm` is kept instead of an mp4.

Record against a build, never the dev server. In development `StrictMode`
runs every effect twice, which can put things on screen that no user sees. A
built app also gives the WebContainer less to do before it is ready, and that
boot is dead time at the head of the video. The preview server sends the
`Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers the
WebContainer needs, because Vite applies the `server.headers` from
`vite.config.ts` to it too.

## Files

| File            | Role                                                  |
| --------------- | ----------------------------------------------------- |
| `scenario.ts`   | What the video shows. This is the file to edit.       |
| `record.ts`     | The two takes, the flags and the onboarding seed.     |
| `kit/cursor.ts` | The visible pointer and its easing.                   |
| `kit/phone.ts`  | The phone stage, its rotation and the fingertip.      |
| `kit/takes.ts`  | Video capture per take, trimming and the ffmpeg join. |

Nothing in `kit/` knows about this app: the app's URL, its phone screen size and
anything to seed before loading are passed in by `record.ts`.

## The pointer

Playwright sends input through the Chrome DevTools Protocol, which never moves
the operating system pointer, so a capture would otherwise show clicks landing
with nothing on screen to explain them. `kit/cursor.ts` injects an SVG arrow into
the page and slaves it to `mousemove`, which puts the pointer inside the
recorded frame. The Playwright mouse still drives everything, so hover, focus
and click targeting behave exactly as they do for a person.

Movement is tweened over wall-clock time along a slight arc. A counted loop
would be at the mercy of CDP round-trip latency and the pacing would drift
between takes.

## The phone

A recording has one frame size for its whole length, so a viewport turned from
portrait to landscape would be squashed into the same box rather than turned.
The phone take records a stage the size of the desktop video instead, with the
app in an iframe drawn as a phone. Rotating swaps the iframe's width and
height, which the app sees as a real resize: its landscape layout comes in
exactly as it does on a device. A still of the old screen covers the swap, then
turns with the phone and fades out over the new layout on the way. The
context has a phone user agent, which gives the app its read-only mobile
editor, and touch, which turns on its `(pointer: coarse)` affordances. Taps
are real touch events, shown by a fingertip drawn on the stage.

## Flags

- `--url=<url>` — record a different origin, e.g. the deployed app
- `--headed` — watch the browser while it plays
- `--keep-webm` — keep Playwright's raw capture next to the mp4

## Length

The recorder prints where each act falls, measured from the moment the app is
ready:

```
    0.0s  ready
   16.1s  act 1 — run and inspect
   ...
```

Use those numbers to trim rather than guessing. The WebContainer boot ahead of
`ready` swings from about five seconds to fifteen on a cold start, so the
recorder keeps a short glimpse of it and cuts the rest, which leaves the running
time decided by the scenario alone.

## Writing a scenario

Wait on the app, never on the clock. `untilStatus("finished")` survives a slow
machine; a `pause(6000)` guessed from one run does not. Beats after a click are
for the viewer, so they can be generous — the panel tour deliberately happens
while execution is paused, because a frozen frame is the one a viewer can read.

The same goes for the editor. Monaco's first type hover of a session waits about
two seconds on the TypeScript worker to load the program, and shows an empty
`Loading...` box meanwhile, so `hoverType` holds until the tooltip has real text
in it. Beats that cost seconds are worth hiding inside a run: the tour asks for
that first type while the program is executing, which pays for the wait twice
over.
