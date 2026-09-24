import { act, renderHook } from "@testing-library/react";

import { SHORT_VIEWPORT_QUERY, useLogsPanelOpen } from "./useLogsPanelOpen";

function mockViewport(short: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query === SHORT_VIEWPORT_QUERY && short,
        media: query,
        addEventListener: (_: string, listener: never) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: never) =>
          listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  return {
    rotate(toShort: boolean) {
      act(() => {
        for (const listener of listeners) {
          listener({ matches: toShort } as MediaQueryListEvent);
        }
      });
    },
  };
}

describe("useLogsPanelOpen", () => {
  it("starts open on a tall viewport", () => {
    mockViewport(false);
    const { result } = renderHook(() => useLogsPanelOpen());
    expect(result.current[0]).toBe(true);
  });

  it("starts closed on a short viewport", () => {
    mockViewport(true);
    const { result } = renderHook(() => useLogsPanelOpen());
    expect(result.current[0]).toBe(false);
  });

  it("closes on rotation to landscape and reopens on rotation back", () => {
    const viewport = mockViewport(false);
    const { result } = renderHook(() => useLogsPanelOpen());

    viewport.rotate(true);
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);

    viewport.rotate(false);
    expect(result.current[0]).toBe(true);
  });
});
