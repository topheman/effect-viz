import { describe, expect, it } from "vite-plus/test";

import {
  declarationCandidates,
  effectPaths,
  effectTypesLayout,
  exportTypesPath,
  relativeSpecifiers,
} from "./effectTypesLayout";

const effect4 = {
  version: "4.1.3",
  exports: {
    ".": "./dist/index.js",
    "./*": "./dist/*.js",
    "./internal/*": null,
  },
};

describe("exportTypesPath", () => {
  it("puts the declaration next to the JS of a string target", () => {
    expect(exportTypesPath(effect4.exports["./*"])).toBe("dist/*.d.ts");
  });

  it("finds none for a null target", () => {
    expect(exportTypesPath(effect4.exports["./internal/*"])).toBeUndefined();
  });

  it("finds none for a string target that is not JS", () => {
    expect(exportTypesPath("./package.json")).toBeUndefined();
  });
});

describe("effectTypesLayout", () => {
  it("reads effect 4's declarations next to the JS", () => {
    expect(effectTypesLayout(effect4)).toEqual({
      entry: "dist/index.d.ts",
      dir: "dist",
    });
  });

  it("names the root export it cannot read", () => {
    expect(() =>
      effectTypesLayout({ version: "9.0.0", exports: { ".": "./index.mjs" } }),
    ).toThrow('effect@9.0.0\'s exports["."] names no declaration file');
  });
});

describe("effectPaths", () => {
  it("maps a root-level entry without a dot segment", () => {
    const layout = effectTypesLayout({
      version: "9.0.0",
      exports: { ".": "./index.js" },
    });
    expect(effectPaths(layout)).toEqual({
      effect: ["node_modules/effect/index.d.ts"],
      "effect/*": ["node_modules/effect/*"],
    });
  });

  it("maps effect 4 into dist", () => {
    expect(effectPaths(effectTypesLayout(effect4))).toEqual({
      effect: ["node_modules/effect/dist/index.d.ts"],
      "effect/*": ["node_modules/effect/dist/*"],
    });
  });
});

describe("__EFFECT_PATHS__", () => {
  it("is what vite.config.ts injects for the installed effect 4", () => {
    expect(__EFFECT_PATHS__).toEqual({
      effect: ["node_modules/effect/dist/index.d.ts"],
      "effect/*": ["node_modules/effect/dist/*"],
    });
  });
});

describe("relativeSpecifiers", () => {
  it("finds imports, re-exports, import types and augmentations", () => {
    const content = [
      'import type { Cause } from "./Cause.ts";',
      'export * as Function from "./Function.ts";',
      'type E = import("./internal/schemaError.ts").SchemaError;',
      'declare module "./Effect.ts" {}',
      'import { pipe } from "effect";',
    ].join("\n");
    expect(relativeSpecifiers(content)).toEqual([
      "./Cause.ts",
      "./Function.ts",
      "./internal/schemaError.ts",
      "./Effect.ts",
    ]);
  });

  it("skips specifiers in comments", () => {
    const content = [
      "/**",
      ' * import { Effect } from "./example.ts"',
      " */",
      '// export * from "./Other.ts"',
    ].join("\n");
    expect(relativeSpecifiers(content)).toEqual([]);
  });
});

describe("declarationCandidates", () => {
  it("maps a .ts specifier to the .d.ts beside it, then a folder index", () => {
    expect(
      declarationCandidates("Schema.d.ts", "./internal/schemaError.ts"),
    ).toEqual(["internal/schemaError.d.ts", "internal/schemaError/index.d.ts"]);
  });

  it("resolves parent segments from the importing file", () => {
    expect(declarationCandidates("internal/core.d.ts", "../Cause.ts")).toEqual([
      "Cause.d.ts",
      "Cause/index.d.ts",
    ]);
  });
});
