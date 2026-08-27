/**
 * Both run paths take their `effect` version from one source: `__EFFECT_VERSION__`,
 * which Vite fills in at build time with the version the app resolves. These tests
 * keep it that way — the container template must name the constant rather than a
 * version of its own, and the dependency must stay exact so a build cannot resolve
 * a newer 3.x than the traces were checked against.
 */
import { version as resolvedEffectVersion } from "effect/package.json";
import { describe, expect, it } from "vitest";

import appPackageJson from "../../package.json?raw";

// Read as text: importing the service initialises esbuild-wasm, which throws under jsdom.
import webcontainerSource from "./webcontainer.ts?raw";

function declaredEffectVersion(): string {
  const pkg = JSON.parse(appPackageJson) as {
    dependencies: Record<string, string>;
  };
  return pkg.dependencies.effect;
}

describe("the effect version the container installs", () => {
  it("comes from the build rather than a second declaration", () => {
    expect(webcontainerSource).toContain('"effect": "${__EFFECT_VERSION__}"');
  });

  it("is the version this build resolves", () => {
    expect(__EFFECT_VERSION__).toBe(resolvedEffectVersion);
  });

  it("is declared exactly, so a build cannot resolve a newer 3.x than it was tested on", () => {
    expect(declaredEffectVersion()).toBe(resolvedEffectVersion);
    expect(declaredEffectVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
