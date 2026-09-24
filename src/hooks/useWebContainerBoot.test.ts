import { act, renderHook } from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebContainerLogsStoreProvider } from "@/stores/webContainerLogsStore";

import { useWebContainerBoot } from "./useWebContainerBoot";

const types = vi.hoisted(() => ({ resolve: () => {} }));

vi.mock("@/effects/typeAcquisition", () => ({
  acquireMonacoTypes: Effect.void,
  acquireMonacoTypesFallback: Effect.promise(
    () => new Promise<void>((resolve) => (types.resolve = resolve)),
  ),
}));

vi.mock("@/lib/transpileForContainer", () => ({
  transpileForContainer: vi.fn(),
}));

// Offline desktop Chrome: fallback, yet `canSupportWebContainer` keeps the Play
// button gated on the boot status.
vi.mock("@/lib/mobileDetection", () => ({
  shouldUseFallback: () => true,
  canSupportWebContainer: () => true,
}));

afterEach(() => vi.clearAllMocks());

describe("useWebContainerBoot on the fallback path", () => {
  it("is in fallback before the types have loaded", async () => {
    const { result } = renderHook(() => useWebContainerBoot(), {
      wrapper: WebContainerLogsStoreProvider,
    });

    expect(result.current.status).toBe("fallback");
    expect(result.current.typesReady).toBe(false);

    await act(async () => types.resolve());

    expect(result.current.status).toBe("fallback");
    expect(result.current.typesReady).toBe(true);
  });
});
