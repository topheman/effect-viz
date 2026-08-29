# Demo recording

Replays a scripted tour of the app in a real browser and records it as an mp4
for the README.

```sh
npm run build && npm run preview   # in one terminal
npm run demo:record
```

The result lands in `recordings/demo.mp4` (gitignored).

Record against a build rather than the dev server: a built app gives the
WebContainer less to do before it is ready, and that boot is dead time at the
head of the video. The dev server works too, via `--url=http://localhost:5173`.
Both send the `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy`
headers the WebContainer needs, because Vite applies the `server.headers` from
`vite.config.ts` to the preview server as well.

## Files

| File          | Role                                            |
| ------------- | ----------------------------------------------- |
| `scenario.ts` | What the video shows. This is the file to edit. |
| `cursor.ts`   | The visible pointer and its easing.             |
| `record.ts`   | Browser setup, video capture, ffmpeg encode.    |

## The pointer

Playwright sends input through the Chrome DevTools Protocol, which never moves
the operating system pointer, so a capture would otherwise show clicks landing
with nothing on screen to explain them. `cursor.ts` injects an SVG arrow into
the page and slaves it to `mousemove`, which puts the pointer inside the
recorded frame. The Playwright mouse still drives everything, so hover, focus
and click targeting behave exactly as they do for a person.

Movement is tweened over wall-clock time along a slight arc. A counted loop
would be at the mercy of CDP round-trip latency and the pacing would drift
between takes.

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
