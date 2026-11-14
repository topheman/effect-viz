/**
 * Where an `effect` package ships its declarations, read from its package.json.
 *
 * Shared by `scripts/extract-effect-dts.mjs`, which extracts the files, and
 * vite.config.ts, which injects the matching Monaco path mapping as
 * `__EFFECT_PATHS__`, so the two cannot drift apart. Kept free of imports so
 * Node runs it from the script by stripping its types.
 */

/** The fields of effect's package.json that locate its declarations. */
export interface EffectPackageJson {
  readonly version: string;
  readonly exports?: Readonly<Record<string, unknown>>;
}

/** The root declaration file and its directory, relative to the package. */
export interface EffectTypesLayout {
  /** `dist/dts/index.d.ts` for effect 3, `dist/index.d.ts` for effect 4. */
  readonly entry: string;
  /** The directory every `effect/<Module>` declaration sits in, `""` for the package root. */
  readonly dir: string;
}

/**
 * The declaration file an `exports` target points TypeScript at, relative to
 * the package: its `types` condition when the target is an object (effect 3),
 * the `.d.ts` next to the JS when it is a string (effect 4). Undefined for any
 * other target, such as the `null` effect 4 maps `internal/*` to.
 */
export function exportTypesPath(target: unknown): string | undefined {
  const types =
    typeof target === "string"
      ? target.endsWith(".js")
        ? `${target.slice(0, -".js".length)}.d.ts`
        : undefined
      : typeof target === "object" &&
          target !== null &&
          "types" in target &&
          typeof target.types === "string"
        ? target.types
        : undefined;
  return types?.replace(/^\.\//, "");
}

/** Locates the root declarations; throws, naming what was found, on a layout it does not know. */
export function effectTypesLayout(pkg: EffectPackageJson): EffectTypesLayout {
  const root = pkg.exports?.["."];
  const entry = exportTypesPath(root);
  if (entry === undefined || !entry.endsWith(".d.ts")) {
    throw new Error(
      `effect@${pkg.version}'s exports["."] names no declaration file; its ` +
        `exports layout changed. Found: ${JSON.stringify(root)}`,
    );
  }
  const slash = entry.lastIndexOf("/");
  return { entry, dir: slash === -1 ? "" : entry.slice(0, slash) };
}

/** The Monaco `paths` mapping for `effect` and `effect/*`, from the package root `node_modules/effect`. */
export function effectPaths(
  layout: EffectTypesLayout,
): Record<string, string[]> {
  const dir = layout.dir === "" ? "" : `${layout.dir}/`;
  return {
    effect: [`node_modules/effect/${layout.entry}`],
    "effect/*": [`node_modules/effect/${dir}*`],
  };
}

const SPECIFIER =
  /(?:from|import\(|declare module)\s*["'](\.{1,2}\/[^"']+)["']/g;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;

/**
 * The relative specifiers a declaration file imports, re-exports or augments
 * (`from "./Effect.js"`, `import("./Cause.ts")`, `declare module "./Effect.js"`).
 * Comments are skipped, since JSDoc examples import paths outside the package.
 */
export function relativeSpecifiers(content: string): string[] {
  return [...content.replace(COMMENT, "").matchAll(SPECIFIER)].map(
    ([, spec]) => spec,
  );
}

/**
 * The declaration files a relative specifier can land on, in TypeScript's
 * order, relative to the same directory as `file`: a `.js` (effect 3) or `.ts`
 * (effect 4) extension maps to the `.d.ts` beside it, a folder to its index.
 */
export function declarationCandidates(file: string, spec: string): string[] {
  const base = new URL(spec, `file:///${file}`).pathname
    .slice(1)
    .replace(/\.[jt]s$/, "");
  return [`${base}.d.ts`, `${base}/index.d.ts`];
}
