import { describe, expect, it } from "vitest";

import { eventGroup } from "./eventGroups";

describe("eventGroup", () => {
  it("puts suspend and resume under scheduling, apart from the lifecycle", () => {
    expect(
      eventGroup({ type: "fiber:suspend", fiberId: "#1", timestamp: 0 }),
    ).toBe("scheduling");
    expect(eventGroup({ type: "fiber:end", fiberId: "#1", timestamp: 0 })).toBe(
      "lifecycle",
    );
  });
});
