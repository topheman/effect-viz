/**
 * Extracts the installed effect package's .d.ts files into one JSON file for the
 * Monaco editor on the fallback path (no WebContainer to read node_modules from).
 *
 * The files are kept one per module, at their node_modules paths, rather than
 * bundled into a single declaration: effect makes Option, Either and Context tags
 * yieldable in Effect.gen through `declare module "./Effect.js"` augmentations,
 * and the bundlers tried (rollup-plugin-dts, dts-bundle-generator, api-extractor)
 * either break those or refuse effect's `export * as` namespaces.
 *
 * The files extracted are the root declaration and everything it reaches through
 * relative imports, located with the rule in src/effects/effectTypesLayout.ts, so
 * the script reads effect 3's layout (`dist/dts/`, `.js` specifiers) and effect
 * 4's (`dist/`, `.ts` specifiers, public files importing `internal/`) alike. A
 * layout change in an effect upgrade fails the build with a message naming what
 * moved, instead of shipping an editor without types.
 */
import fs from "node:fs";
import path from "node:path";

import {
  declarationCandidates,
  effectTypesLayout,
  exportTypesPath,
  relativeSpecifiers,
} from "../src/effects/effectTypesLayout.ts";

const PKG_DIR = "node_modules/effect";

function fail(message) {
  console.error(`extract-effect-dts: ${message}`);
  process.exit(1);
}

const out = path.resolve(
  process.argv.find((arg) => arg.startsWith("--out="))?.split("=")[1] ??
    "public/effect-types.json",
);

const pkgJsonPath = path.resolve(PKG_DIR, "package.json");
if (!fs.existsSync(pkgJsonPath)) {
  fail(`${pkgJsonPath} not found. Run pnpm install first.`);
}
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

let layout;
try {
  layout = effectTypesLayout(pkg);
} catch (error) {
  fail(error.message);
}
const dtsDir = path.resolve(PKG_DIR, layout.dir);
const entry = path.posix.relative(layout.dir, layout.entry);
if (!fs.existsSync(path.join(dtsDir, entry))) {
  fail(`${layout.entry} is declared by package.json but missing on disk.`);
}

const contents = new Map();
const unresolved = [];
// Follows relative imports from the entry; one landing on no file would leave
// Monaco typing its names as any.
const pending = [entry];
while (pending.length > 0) {
  const file = pending.pop();
  if (contents.has(file)) continue;
  const content = fs
    .readFileSync(path.join(dtsDir, file), "utf8")
    .replace(/^\/\/# sourceMappingURL=.*$/m, "");
  contents.set(file, content);
  for (const spec of relativeSpecifiers(content)) {
    const target = declarationCandidates(file, spec).find((candidate) =>
      fs.existsSync(path.join(dtsDir, candidate)),
    );
    if (target === undefined) unresolved.push(`  ${file}: "${spec}"`);
    else pending.push(target);
  }
}
if (unresolved.length > 0) {
  fail(
    `${unresolved.length} relative import(s) resolve to no declaration file ` +
      `(a new declaration extension?):\n` +
      unresolved.slice(0, 20).join("\n"),
  );
}
// A bare sort(), spelled out for oxlint's require-array-sort-compare.
const relFiles = [...contents.keys()].sort((a, b) =>
  a < b ? -1 : a > b ? 1 : 0,
);

// Every top-level `effect/<Module>` must be extracted, as Monaco's `effect/*`
// mapping points there: effect 3's explicit subpaths, effect 4's `./*` matches.
// Effect 4's folder indexes (`effect/http`…) are left out to keep the file
// small. Files effect does not ship (3.22.1's `./.index`) are skipped.
const subpathFiles = Object.entries(pkg.exports)
  .filter(([key]) => key !== ".")
  .flatMap(([key, target]) => {
    const types = exportTypesPath(target);
    if (types === undefined) return [];
    const files = key.includes("*")
      ? fs
          .globSync(types, { cwd: path.resolve(PKG_DIR) })
          .map((file) => file.split(path.sep).join("/"))
      : [types];
    return files.map((file) => ({
      key: key.includes("*") ? file : key,
      file: path.posix.relative(layout.dir, path.posix.normalize(file)),
    }));
  })
  .filter(({ file }) => file.startsWith("../") || !file.includes("/"))
  .filter(({ file }) => fs.existsSync(path.join(dtsDir, file)));
const extracted = new Set(relFiles);
const missingSubpaths = subpathFiles.filter(({ file }) => !extracted.has(file));
if (missingSubpaths.length > 0) {
  fail(
    `these export subpaths are not reachable from ${layout.entry}:\n` +
      missingSubpaths.map(({ key, file }) => `  ${key} -> ${file}`).join("\n"),
  );
}

fs.writeFileSync(
  out,
  JSON.stringify({
    version: pkg.version,
    files: relFiles.map((file) => ({
      path: `file:///${path.posix.join(PKG_DIR, layout.dir, file)}`,
      content: contents.get(file),
    })),
  }),
);
console.log(
  `extract-effect-dts: ${relFiles.length} files from effect@${pkg.version} -> ${path.relative(process.cwd(), out)}`,
);
