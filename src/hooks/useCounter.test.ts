import { act, renderHook } from "@testing-library/react";

import { useCounter } from "./useCounter";

describe("useCounter", () => {
  it("increments the count", () => {
    const { result } = renderHook(() => useCounter());

    expect(result.current.count).toBe(0);

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
