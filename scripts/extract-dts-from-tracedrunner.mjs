/**
 * Extracts .d.ts files from a tracedRunner bundle and outputs them as JSON to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Retrieve src path from --src flag using the built-in Node.js API (process.argv), fallback to "dist/tracedrunner" if not provided.
const parsed = process.argv.find((arg) => arg.startsWith("--src="));
if (!parsed) {
  console.error("extract-dts-from-tracedrunner: missing --src flag (e.g. --src=dist/tracedrunner)");
  process.exit(1);
}
const src = path.resolve(parsed.split("=")[1]);

if (!fs.existsSync(src)) {
  console.error("extract-dts-from-tracedrunner: dist/tracedrunner not found. Run build:tracedrunner first.");
  process.exit(1);
}

const APP_LIB_URLS = [];

for (const file of fs.globSync(`${src}/**/*.d.ts`)) {
  const relativePath = path.relative(src, file);
  APP_LIB_URLS.push({
    url: `/app/${relativePath}`,
    path: `file:///${relativePath}`,
  })
}

console.log(JSON.stringify(APP_LIB_URLS, null, 2));
