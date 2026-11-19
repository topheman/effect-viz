import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { TraceEvent } from "@/types/trace";

import {
  clearLogTarget,
  targetedIndex,
  targetLogRow,
  useLogTarget,
} from "./useLogTarget";

const fork = (fiberId: string): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  label: fiberId,
  timestamp: 0,
});

beforeEach(() => clearLogTarget());

describe("useLogTarget", () => {
  it("holds the row asked for while the trace is the one it was asked on", () => {
    const events = [fork("#1"), fork("#2")];
    const { result } = renderHook(() => useLogTarget());

    act(() => targetLogRow(events, 1));

    expect(targetedIndex(result.current, events)).toBe(1);
  });

  it("drops the row once a new event arrives", () => {
    const events = [fork("#1"), fork("#2")];
    act(() => targetLogRow(events, 1));
    const { result } = renderHook(() => useLogTarget());

    expect(targetedIndex(result.current, [...events, fork("#3")])).toBe(
      undefined,
    );
  });

  it("drops the row in another run", () => {
    act(() => targetLogRow([fork("#1"), fork("#2")], 1));
    const { result } = renderHook(() => useLogTarget());

    expect(targetedIndex(result.current, [fork("#1"), fork("#2")])).toBe(
      undefined,
    );
  });

  it("is a new target each time, so asking twice scrolls twice", () => {
    const events = [fork("#1")];
    const { result } = renderHook(() => useLogTarget());

    act(() => targetLogRow(events, 0));
    const first = result.current;
    act(() => targetLogRow(events, 0));

    expect(result.current).not.toBe(first);
  });
});
