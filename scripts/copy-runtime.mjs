/**
 * Copies dist/runtime to public/app.
 * Run after vite build and tsc in build:runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "dist/runtime");
const dest = path.join(root, "public/app");

if (!fs.existsSync(src)) {
  console.error("copy-runtime: dist/runtime not found. Run build:runtime first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("copy-runtime: copied dist/runtime → public/app");
