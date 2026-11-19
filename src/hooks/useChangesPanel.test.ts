import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { TraceEvent } from "@/types/trace";

import {
  resetChangesPanel,
  selectChange,
  toggleChangesPanel,
  useChangesPanel,
} from "./useChangesPanel";

const run = (): TraceEvent[] => [
  { type: "fiber:fork", fiberId: "#1", label: "#1", timestamp: 0 },
];

beforeEach(() => resetChangesPanel());

describe("useChangesPanel", () => {
  it("starts on the tree with nothing selected", () => {
    const { result } = renderHook(() => useChangesPanel(run()));
    expect(result.current).toEqual({ open: false, selected: null });
  });

  it("opens and goes back to the tree", () => {
    const events = run();
    const { result } = renderHook(() => useChangesPanel(events));

    act(() => toggleChangesPanel(events));
    expect(result.current.open).toBe(true);

    act(() => toggleChangesPanel(events));
    expect(result.current.open).toBe(false);
  });

  it("selects a change and clears it when selected again", () => {
    const events = run();
    const { result } = renderHook(() => useChangesPanel(events));

    act(() => selectChange(events, "fork-runs-at-once"));
    expect(result.current.selected).toBe("fork-runs-at-once");

    act(() => selectChange(events, "fork-runs-at-once"));
    expect(result.current.selected).toBe(null);
  });

  it("is shared by every mounted copy of the card", () => {
    const events = run();
    const { result: first } = renderHook(() => useChangesPanel(events));
    const { result: second } = renderHook(() => useChangesPanel(events));

    act(() => toggleChangesPanel(events));

    expect(first.current.open).toBe(true);
    expect(second.current.open).toBe(true);
  });

  it("starts a new run on the tree", () => {
    const events = run();
    act(() => {
      toggleChangesPanel(events);
      selectChange(events, "fork-runs-at-once");
    });

    const { result } = renderHook(() => useChangesPanel(run()));

    expect(result.current).toEqual({ open: false, selected: null });
  });
});
