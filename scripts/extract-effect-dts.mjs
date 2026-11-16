/**
 * Extracts the installed effect package's .d.ts files into one JSON file for the
 * Monaco editor on the fallback path (no WebContainer to read node_modules from).
 *
 * The files are kept one per module, at their node_modules paths, rather than
 * bundled into a single declaration: the bundlers tried (rollup-plugin-dts,
 * dts-bundle-generator, api-extractor) refuse effect's `export * as` namespaces.
 *
 * The files extracted are the root declaration and everything it reaches through
 * relative imports, located with the rule in src/effects/effectTypesLayout.ts:
 * `dist/`, `.ts` specifiers, public files importing `internal/`. A layout change
 * in an effect upgrade fails the build with a message naming what moved,
 * instead of shipping an editor without types.
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
// mapping points there: the files the `./*` pattern export matches. The folder
// indexes (`effect/http`…), explicit subpaths, are left out to keep the file small.
const subpathFiles = Object.entries(pkg.exports)
  .filter(([key]) => key.includes("*"))
  .flatMap(([, target]) => {
    const types = exportTypesPath(target);
    if (types === undefined) return [];
    return fs
      .globSync(types, { cwd: path.resolve(PKG_DIR) })
      .map((file) =>
        path.posix.relative(layout.dir, file.split(path.sep).join("/")),
      );
  });
const extracted = new Set(relFiles);
const missingSubpaths = subpathFiles.filter((file) => !extracted.has(file));
if (missingSubpaths.length > 0) {
  fail(
    `these export subpaths are not reachable from ${layout.entry}:\n` +
      missingSubpaths.map((file) => `  ${file}`).join("\n"),
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
