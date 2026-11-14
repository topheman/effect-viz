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
  effectTypesLayout,
  exportTypesPath,
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

// Relative specifiers (`from "./Effect.js"`, `import("./Cause.ts")`,
// `declare module "./Effect.js"`) are followed from the entry; one that lands
// on no file would leave Monaco typing its names as any. Comments are skipped:
// JSDoc examples import from paths that are not part of the package.
const SPECIFIER =
  /(?:from|import\(|declare module)\s*["'](\.{1,2}\/[^"']+)["']/g;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;

const contents = new Map();
const unresolved = [];
const pending = [entry];
while (pending.length > 0) {
  const file = pending.pop();
  if (contents.has(file)) continue;
  const content = fs
    .readFileSync(path.join(dtsDir, file), "utf8")
    .replace(/^\/\/# sourceMappingURL=.*$/m, "");
  contents.set(file, content);
  for (const [, spec] of content.replace(COMMENT, "").matchAll(SPECIFIER)) {
    const base = path.posix
      .join(path.posix.dirname(file), spec)
      .replace(/\.[jt]s$/, "");
    const target = [`${base}.d.ts`, `${base}/index.d.ts`].find((candidate) =>
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
// Code-unit order, as a bare sort() would give, so the output stays stable.
const relFiles = [...contents.keys()].sort((a, b) =>
  a < b ? -1 : a > b ? 1 : 0,
);

// Every `effect/<Module>` must be extracted, since that is what Monaco's
// `effect/*` path mapping points at: the subpaths effect 3 lists one by one, and
// the files effect 4's `./*` pattern matches. Only files directly in the
// declarations directory count: effect 4's folder packages (`effect/http`…) are
// not reachable from the entry and are left out. Subpaths whose file effect does
// not ship (3.22.1 declares `./.index` without it) are broken upstream too.
const subpathFiles = Object.entries(pkg.exports)
  .filter(([key]) => key !== ".")
  .flatMap(([key, target]) => {
    const types = exportTypesPath(target);
    if (types === undefined) return [];
    const files = key.includes("*")
      ? fs.globSync(types, { cwd: path.resolve(PKG_DIR) })
      : [types];
    return files.map((file) => ({
      key: key.includes("*") ? file : key,
      file: path.posix.relative(layout.dir, path.posix.normalize(file)),
    }));
  })
  .filter(({ file }) => !file.includes("/"))
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
      path: `file:///${PKG_DIR}/${layout.dir}/${file}`,
      content: contents.get(file),
    })),
  }),
);
console.log(
  `extract-effect-dts: ${relFiles.length} files from effect@${pkg.version} -> ${path.relative(process.cwd(), out)}`,
);
