/**
 * Effect-patched Oxlint for the editor: `oxc.path.oxlint` in .vscode/settings.json
 * points here. Stock Oxlint rejects the `effecttsgo` plugin vite.config.ts enables,
 * so the extension's language server goes through `effect-tsgo vp lint` instead.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const effectTsgo = path.join(
  path.dirname(
    createRequire(import.meta.url).resolve("@effect/tsgo/package.json"),
  ),
  "dist/effect-tsgo.cjs",
);
const child = spawn(
  process.execPath,
  [effectTsgo, "vp", "lint", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
// The editor stops the server by signalling this wrapper; pass it on to the child.
const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
const forward = (signal) => child.kill(signal);
for (const signal of signals) process.on(signal, forward);
child.on("exit", (code, signal) => {
  for (const s of signals) process.off(s, forward);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
