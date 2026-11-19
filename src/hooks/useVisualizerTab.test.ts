import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { resetVisualizerTab, useVisualizerTab } from "./useVisualizerTab";

beforeEach(() => resetVisualizerTab());

describe("useVisualizerTab", () => {
  it("starts on the Execution Log", () => {
    const { result } = renderHook(() => useVisualizerTab());
    expect(result.current[0]).toBe("log");
  });

  it("shares the tab between every reader", () => {
    const { result: first } = renderHook(() => useVisualizerTab());
    const { result: second } = renderHook(() => useVisualizerTab());

    act(() => first.current[1]("fibers"));

    expect(second.current[0]).toBe("fibers");
  });
});
