import { migrateLegacyStorage } from "./legacyStorage";

describe("migrateLegacyStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("moves each effect-flow key to its effect-viz key", () => {
    localStorage.setItem("effect-flow-onboarding", '{"completed":"info"}');
    localStorage.setItem("effect-flow-show-internals", "true");
    localStorage.setItem("effect-flow-speed", "0.25");

    migrateLegacyStorage();

    expect(localStorage.getItem("effect-viz-onboarding")).toBe(
      '{"completed":"info"}',
    );
    expect(localStorage.getItem("effect-viz-show-internals")).toBe("true");
    expect(localStorage.getItem("effect-viz-speed")).toBe("0.25");
    expect(localStorage.getItem("effect-flow-onboarding")).toBeNull();
    expect(localStorage.getItem("effect-flow-show-internals")).toBeNull();
    expect(localStorage.getItem("effect-flow-speed")).toBeNull();
  });

  it("keeps a value already saved under the new key", () => {
    localStorage.setItem("effect-flow-speed", "0.25");
    localStorage.setItem("effect-viz-speed", "0.5");

    migrateLegacyStorage();

    expect(localStorage.getItem("effect-viz-speed")).toBe("0.5");
    expect(localStorage.getItem("effect-flow-speed")).toBeNull();
  });
});
