import { describe, expect, it } from "vite-plus/test";

import {
  effectPaths,
  effectTypesLayout,
  exportTypesPath,
} from "./effectTypesLayout";

const effect3 = {
  version: "3.22.1",
  exports: {
    ".": {
      types: "./dist/dts/index.d.ts",
      import: "./dist/esm/index.js",
      default: "./dist/cjs/index.js",
    },
    "./Effect": {
      types: "./dist/dts/Effect.d.ts",
      import: "./dist/esm/Effect.js",
      default: "./dist/cjs/Effect.js",
    },
  },
};

const effect4 = {
  version: "4.1.3",
  exports: {
    ".": "./dist/index.js",
    "./*": "./dist/*.js",
    "./internal/*": null,
  },
};

describe("exportTypesPath", () => {
  it("takes the types condition of an object target", () => {
    expect(exportTypesPath(effect3.exports["./Effect"])).toBe(
      "dist/dts/Effect.d.ts",
    );
  });

  it("puts the declaration next to the JS of a string target", () => {
    expect(exportTypesPath(effect4.exports["./*"])).toBe("dist/*.d.ts");
  });

  it("finds none for a null target", () => {
    expect(exportTypesPath(effect4.exports["./internal/*"])).toBeUndefined();
  });
});

describe("effectTypesLayout", () => {
  it("reads effect 3's dist/dts layout", () => {
    expect(effectTypesLayout(effect3)).toEqual({
      entry: "dist/dts/index.d.ts",
      dir: "dist/dts",
    });
  });

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
  it("maps effect and effect/* into the declarations directory", () => {
    expect(effectPaths(effectTypesLayout(effect4))).toEqual({
      effect: ["node_modules/effect/dist/index.d.ts"],
      "effect/*": ["node_modules/effect/dist/*"],
    });
  });

  it("is what the build injects for the installed effect 3", () => {
    expect(__EFFECT_PATHS__).toEqual({
      effect: ["node_modules/effect/dist/dts/index.d.ts"],
      "effect/*": ["node_modules/effect/dist/dts/*"],
    });
  });
});
