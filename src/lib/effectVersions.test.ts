import { describe, expect, it } from "vite-plus/test";

import { CURRENT_MAJOR, EFFECT_VERSION_SITES, majorOf } from "./effectVersions";

describe("majorOf", () => {
  it("reads the major of a release and of a prerelease", () => {
    expect(majorOf("3.22.1")).toBe(3);
    expect(majorOf("4.0.0-beta.3")).toBe(4);
  });
});

describe("EFFECT_VERSION_SITES", () => {
  it("has a site for the Effect major this build runs on", () => {
    expect(EFFECT_VERSION_SITES.map((site) => site.major)).toContain(
      CURRENT_MAJOR,
    );
  });
});
