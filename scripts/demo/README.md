# Demo recording

Replays a scripted tour of the app in a real browser and records it as an mp4
for the README.

```sh
npm run dev        # in one terminal
npm run demo:record
```

The result lands in `recordings/demo.mp4` (gitignored).

The dev server is required rather than `vite preview`: the WebContainer needs
the `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers that
`vite.config.ts` only sets on `server`.

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

## Writing a scenario

Wait on the app, never on the clock. `untilStatus("finished")` survives a slow
machine; a `pause(6000)` guessed from one run does not. Beats after a click are
for the viewer, so they can be generous — the panel tour deliberately happens
while execution is paused, because a frozen frame is the one a viewer can read.
