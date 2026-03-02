/**
 * Vite plugin: watches src/runtime and runtime dependencies, runs build:runtime
 * on change, then triggers a full reload so the dev server serves the updated
 * runtime and the WebContainer fetches it on next boot.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, ".");
const DEBOUNCE_MS = 300;

export function runtimeWatchPlugin() {
  let server: { ws: { send: (payload: object) => void } } | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isBuilding = false;

  const runBuild = () => {
    if (isBuilding) return;
    isBuilding = true;
    console.log("[runtime-watch] Rebuilding runtime...");
    const child = spawn("npm", ["run", "build:runtime"], {
      cwd: root,
      shell: true,
      stdio: "inherit",
    });
    child.on("close", (code) => {
      isBuilding = false;
      if (code === 0) {
        console.log("[runtime-watch] Runtime rebuilt successfully");
        if (server?.ws) {
          server.ws.send({ type: "full-reload", path: "*" });
        }
      } else {
        console.error(`[runtime-watch] build:runtime failed (exit ${code})`);
      }
    });
  };

  const scheduleBuild = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runBuild();
    }, DEBOUNCE_MS);
  };

  const watchPaths = [
    path.join(root, "src/runtime"),
    path.join(root, "src/lib/crypto.ts"),
    path.join(root, "src/types/trace.ts"),
  ];

  return {
    name: "runtime-watch",
    configureServer(s: typeof server) {
      server = s;
      for (const p of watchPaths) {
        if (!fs.existsSync(p)) continue;
        const isDir = fs.statSync(p).isDirectory();
        fs.watch(p, { recursive: isDir }, (_eventType, filename) => {
          // filename may be undefined on some platforms; schedule build to be safe
          if (!filename || /\.(ts|tsx|js|json)$/.test(filename)) {
            scheduleBuild();
          }
        });
        console.log(`[runtime-watch] Watching ${path.relative(root, p)}`);
      }
    },
  };
}
