import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { TraceEvent } from "@/types/trace";

import {
  resetChangesPanel,
  toggleChangesPanel,
  useChangesPanel,
} from "./useChangesPanel";

const run = (): TraceEvent[] => [
  { type: "fiber:fork", fiberId: "#1", label: "#1", timestamp: 0 },
];

beforeEach(() => resetChangesPanel());

describe("useChangesPanel", () => {
  it("starts on the tree", () => {
    const { result } = renderHook(() => useChangesPanel(run()));
    expect(result.current).toBe(false);
  });

  it("opens and goes back to the tree", () => {
    const events = run();
    const { result } = renderHook(() => useChangesPanel(events));

    act(() => toggleChangesPanel(events));
    expect(result.current).toBe(true);

    act(() => toggleChangesPanel(events));
    expect(result.current).toBe(false);
  });

  it("is shared by every mounted copy of the card", () => {
    const events = run();
    const { result: first } = renderHook(() => useChangesPanel(events));
    const { result: second } = renderHook(() => useChangesPanel(events));

    act(() => toggleChangesPanel(events));

    expect(first.current).toBe(true);
    expect(second.current).toBe(true);
  });

  it("starts a new run on the tree", () => {
    act(() => toggleChangesPanel(run()));

    const { result } = renderHook(() => useChangesPanel(run()));

    expect(result.current).toBe(false);
  });

  it("opens on a new run when the button is pressed there", () => {
    act(() => toggleChangesPanel(run()));
    const events = run();
    const { result } = renderHook(() => useChangesPanel(events));

    act(() => toggleChangesPanel(events));

    expect(result.current).toBe(true);
  });
});
