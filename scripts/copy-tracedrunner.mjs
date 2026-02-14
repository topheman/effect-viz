/**
 * Copies dist/tracedrunner to public/app.
 * Run after vite build and tsc in build:tracedrunner.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "dist/tracedrunner");
const dest = path.join(root, "public/app");

if (!fs.existsSync(src)) {
  console.error("copy-tracedrunner: dist/tracedrunner not found. Run build:tracedrunner first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("copy-tracedrunner: copied dist/tracedrunner → public/app");
