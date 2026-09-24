/**
 * Extracts the installed effect package's .d.ts files into one JSON file for the
 * Monaco editor on the fallback path (no WebContainer to read node_modules from).
 *
 * The files are kept one per module, at their node_modules paths, rather than
 * bundled into a single declaration: effect makes Option, Either and Context tags
 * yieldable in Effect.gen through `declare module "./Effect.js"` augmentations,
 * and the bundlers tried (rollup-plugin-dts, dts-bundle-generator, api-extractor)
 * either break those or refuse effect's `export * as` namespaces.
 */
import fs from "node:fs";
import path from "node:path";

const pkgDir = path.resolve("node_modules/effect");
const dtsDir = path.join(pkgDir, "dist/dts");
const out = path.resolve(
  process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1] ??
    "public/effect-types.json",
);

// internal/ is never referenced by the public declarations.
const files = fs
  .globSync("**/*.d.ts", { cwd: dtsDir, exclude: ["internal/**"] })
  .sort()
  .map((file) => ({
    path: `file:///node_modules/effect/dist/dts/${file.split(path.sep).join("/")}`,
    content: fs
      .readFileSync(path.join(dtsDir, file), "utf8")
      .replace(/^\/\/# sourceMappingURL=.*$/m, ""),
  }));

const { version } = JSON.parse(
  fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
);
fs.writeFileSync(out, JSON.stringify({ version, files }));
console.log(
  `extract-effect-dts: ${files.length} files from effect@${version} -> ${path.relative(process.cwd(), out)}`,
);
