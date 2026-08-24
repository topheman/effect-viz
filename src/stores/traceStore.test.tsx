import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { TraceStoreProvider, useTraceStore } from "@/stores/traceStore";

const render = () =>
  renderHook(() => useTraceStore(), { wrapper: TraceStoreProvider });

describe("useTraceStore virtual now", () => {
  /**
   * The timeline measures its live cursor against event timestamps, which are
   * virtual. Extrapolating from a rate cannot see a clock that the stepper has
   * frozen or jumped, so a running clock is read directly when there is one.
   */
  it("reads the clock when a source is set", () => {
    const { result } = render();

    act(() => result.current.setNowSource(() => 4242));

    expect(result.current.getVirtualNow()).toBe(4242);
  });

  it("follows the clock as it moves", () => {
    const { result } = render();
    let virtual = 1000;

    act(() => result.current.setNowSource(() => virtual));
    expect(result.current.getVirtualNow()).toBe(1000);

    virtual = 2500;
    expect(result.current.getVirtualNow()).toBe(2500);
  });

  it("falls back to wall time when there is no clock to read", () => {
    const { result } = render();
    const before = Date.now();

    act(() => result.current.setNowSource(null));

    expect(result.current.getVirtualNow()).toBeGreaterThanOrEqual(before);
  });

  it("drops the clock on clear, so a finished run cannot be read", () => {
    const { result } = render();

    act(() => result.current.setNowSource(() => 4242));
    act(() => result.current.clear());

    expect(result.current.getVirtualNow()).not.toBe(4242);
  });
});
