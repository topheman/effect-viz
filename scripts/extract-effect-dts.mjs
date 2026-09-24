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
 * Every assumption about effect's layout is checked against its package.json and
 * the extracted files, so a layout change in an effect upgrade fails the build
 * with a message naming what moved, instead of shipping an editor without types.
 */
import fs from "node:fs";
import path from "node:path";

// Must match EFFECT_PATHS in src/effects/typeAcquisition.ts, which points Monaco
// at these files on both editor paths.
const PKG_DIR = "node_modules/effect";
const DTS_SUBDIR = "dist/dts";
const DTS_DIR = `${PKG_DIR}/${DTS_SUBDIR}`;
const ENTRY = "index.d.ts";

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
  fail(`${pkgJsonPath} not found. Run npm install first.`);
}
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

// The "." export's types is where TypeScript resolves `import ... from "effect"`.
const rootTypes = pkg.exports?.["."]?.types;
if (typeof rootTypes !== "string") {
  fail(
    `effect@${pkg.version}'s package.json has no exports["."].types; ` +
      `its exports layout changed. Found: ${JSON.stringify(pkg.exports?.["."])}`,
  );
}
const expectedRootTypes = `./${DTS_SUBDIR}/${ENTRY}`;
if (rootTypes !== expectedRootTypes) {
  fail(
    `effect@${pkg.version} declares its types at "${rootTypes}", expected ` +
      `"${expectedRootTypes}". Update DTS_SUBDIR/ENTRY here and EFFECT_PATHS in ` +
      `src/effects/typeAcquisition.ts together.`,
  );
}

const dtsDir = path.resolve(DTS_DIR);
if (!fs.existsSync(path.join(dtsDir, ENTRY))) {
  fail(`${DTS_DIR}/${ENTRY} is declared by package.json but missing on disk.`);
}

// internal/ is never referenced by the public declarations; the import check
// below fails if that stops being true.
const relFiles = fs
  .globSync("**/*.d.ts", { cwd: dtsDir, exclude: ["internal/**"] })
  .map((file) => file.split(path.sep).join("/"))
  .sort();
const extracted = new Set(relFiles);

// Every `effect/<Module>` subpath must resolve to an extracted file, since that
// is what Monaco's `effect/*` path mapping points at. Subpaths whose file effect
// does not ship (3.22.1 declares `./.index` without it) are broken upstream too.
const missingSubpaths = Object.entries(pkg.exports)
  .filter(([key, value]) => key !== "." && typeof value?.types === "string")
  .filter(([, value]) => fs.existsSync(path.resolve(PKG_DIR, value.types)))
  .map(([key, value]) => ({
    key,
    file: path.posix.relative(DTS_SUBDIR, path.posix.normalize(value.types)),
  }))
  .filter(({ file }) => !extracted.has(file));
if (missingSubpaths.length > 0) {
  fail(
    `these export subpaths point at files outside the extraction:\n` +
      missingSubpaths
        .map(({ key, file }) => `  effect/${key.slice(2)} -> ${file}`)
        .join("\n"),
  );
}

const files = relFiles.map((file) => ({
  file,
  content: fs
    .readFileSync(path.join(dtsDir, file), "utf8")
    .replace(/^\/\/# sourceMappingURL=.*$/m, ""),
}));

// Relative specifiers (`from "./Effect.js"`, `import("./Cause.js")`,
// `declare module "./Effect.js"`) must land on an extracted file, or Monaco
// silently types those names as any. Comments are skipped: JSDoc examples
// import from paths that are not part of the package.
const SPECIFIER =
  /(?:from|import\(|declare module)\s*["'](\.{1,2}\/[^"']+)["']/g;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
const unresolved = [];
for (const { file, content } of files) {
  for (const [, spec] of content.replace(COMMENT, "").matchAll(SPECIFIER)) {
    const base = path.posix
      .join(path.posix.dirname(file), spec)
      .replace(/\.js$/, "");
    if (
      !extracted.has(`${base}.d.ts`) &&
      !extracted.has(`${base}/index.d.ts`)
    ) {
      unresolved.push(`  ${file}: "${spec}"`);
    }
  }
}
if (unresolved.length > 0) {
  fail(
    `${unresolved.length} relative import(s) resolve outside the extraction ` +
      `(an internal/ reference, or a new declaration extension?):\n` +
      unresolved.slice(0, 20).join("\n"),
  );
}

fs.writeFileSync(
  out,
  JSON.stringify({
    version: pkg.version,
    files: files.map(({ file, content }) => ({
      path: `file:///${DTS_DIR}/${file}`,
      content,
    })),
  }),
);
console.log(
  `extract-effect-dts: ${files.length} files from effect@${pkg.version} -> ${path.relative(process.cwd(), out)}`,
);
