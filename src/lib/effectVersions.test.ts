import { describe, expect, it } from "vite-plus/test";

import { majorOf } from "./effectVersions";

describe("majorOf", () => {
  it("reads the major of a release and of a prerelease", () => {
    expect(majorOf("3.22.1")).toBe(3);
    expect(majorOf("4.0.0-beta.3")).toBe(4);
  });
});
