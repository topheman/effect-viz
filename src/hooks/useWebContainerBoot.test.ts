import { act, renderHook } from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useWebContainerLogsStore,
  WebContainerLogsStoreProvider,
} from "@/stores/webContainerLogsStore";

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

// Defaults to offline desktop Chrome: fallback, yet `canSupportWebContainer`
// keeps the Play button gated on the boot status.
const env = vi.hoisted(() => ({ canSupport: true, offline: true }));

vi.mock("@/lib/mobileDetection", () => ({
  shouldUseFallback: () => true,
  canSupportWebContainer: () => env.canSupport,
  isOffline: () => env.offline,
}));

afterEach(() => {
  vi.clearAllMocks();
  env.canSupport = true;
  env.offline = true;
});

function bootMessages() {
  const { result } = renderHook(
    () => ({
      logs: useWebContainerLogsStore().logs,
      boot: useWebContainerBoot(),
    }),
    { wrapper: WebContainerLogsStoreProvider },
  );
  return result.current.logs.slice(0, 2).map((log) => log.message);
}

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

describe("useWebContainerBoot boot message", () => {
  it("says offline on desktop Chrome, with a reconnect hint", () => {
    const [reason, hint] = bootMessages();
    expect(reason).toMatch(/^Offline/);
    expect(hint).toMatch(/reconnect/);
  });

  it("says offline on mobile or Safari, with the browser hint", () => {
    env.canSupport = false;
    const [reason, hint] = bootMessages();
    expect(reason).toMatch(/^Offline/);
    expect(hint).toMatch(/Desktop Chrome/);
  });

  it("names mobile or Safari when online", () => {
    env.canSupport = false;
    env.offline = false;
    const [reason, hint] = bootMessages();
    expect(reason).toMatch(/^Mobile or Safari detected/);
    expect(hint).toMatch(/Desktop Chrome/);
  });
});
