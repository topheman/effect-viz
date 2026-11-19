import { describe, expect, it } from "vite-plus/test";

import { eventGroup } from "./eventGroups";

describe("eventGroup", () => {
  it("puts suspend and resume under scheduling, apart from the lifecycle", () => {
    expect(
      eventGroup({
        type: "fiber:suspend",
        fiberId: "#1",
        reason: { kind: "yield" },
        timestamp: 0,
      }),
    ).toBe("scheduling");
    expect(
      eventGroup({
        type: "fiber:end",
        fiberId: "#1",
        result: "success",
        timestamp: 0,
      }),
    ).toBe("lifecycle");
  });
});
