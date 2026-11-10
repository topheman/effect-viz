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
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
