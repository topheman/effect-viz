/**
 * Vite plugin: watches src/runtime and runtime dependencies, runs build:runtime
 * on change, then triggers a full reload so the dev server serves the updated
 * runtime and the WebContainer fetches it on next boot.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin, ViteDevServer } from "vite-plus";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, ".");
const DEBOUNCE_MS = 300;

export function runtimeWatchPlugin(): Plugin {
  let server: ViteDevServer | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isBuilding = false;

  const runBuild = () => {
    if (isBuilding) return;
    isBuilding = true;
    console.log("[runtime-watch] Rebuilding runtime...");
    const child = spawn("pnpm", ["run", "build:runtime"], {
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

  const isWatched = (file: string) =>
    watchPaths.some((p) => file === p || file.startsWith(p + path.sep));

  return {
    name: "runtime-watch",
    configureServer(s) {
      server = s;
      // Vite's own watcher already covers these paths and is closed with the
      // server; a separate fs.watch handle would keep Vitest's servers alive.
      for (const event of ["add", "change", "unlink"] as const) {
        s.watcher.on(event, (file) => {
          if (isWatched(file) && /\.(ts|tsx|js|json)$/.test(file)) {
            scheduleBuild();
          }
        });
      }
      for (const p of watchPaths) {
        console.log(`[runtime-watch] Watching ${path.relative(root, p)}`);
      }
    },
  };
}
