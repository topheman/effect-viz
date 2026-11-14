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
  /** The directory every `effect/<Module>` declaration sits in. */
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
  return { entry, dir: slash === -1 ? "." : entry.slice(0, slash) };
}

/** The Monaco `paths` mapping for `effect` and `effect/*`, from the package root `node_modules/effect`. */
export function effectPaths(
  layout: EffectTypesLayout,
): Record<string, string[]> {
  return {
    effect: [`node_modules/effect/${layout.entry}`],
    "effect/*": [`node_modules/effect/${layout.dir}/*`],
  };
}
