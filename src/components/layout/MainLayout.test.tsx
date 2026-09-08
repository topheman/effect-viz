import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";

import { type ProgramKey, programs } from "@/lib/programs";

import { MainLayout } from "./MainLayout";

/**
 * The run in flight, if any. `handlePlay` hands back a promise the test settles
 * itself, so a program can be held mid-run for as long as a switch takes.
 */
let currentRun: {
  resolve: () => void;
  reject: (error: unknown) => void;
} | null = null;
const handleReset = vi.fn();

vi.mock("@/hooks/useEventHandlers", () => ({
  useEventHandlers: () => {
    const [selectedProgram, setSelectedProgram] = useState<ProgramKey>("basic");
    return {
      handlePlay: ({ onFirstChunk }: { onFirstChunk: () => void }) => {
        onFirstChunk();
        return new Promise<void>((resolve, reject) => {
          currentRun = { resolve: () => resolve(), reject };
        });
      },
      handlePause: vi.fn(),
      handleResume: vi.fn(),
      handleStep: vi.fn(),
      handleSetRate: vi.fn(),
      handleReset,
      selectedProgram,
      setSelectedProgram,
      programs,
    };
  },
}));

vi.mock("@/hooks/useWebContainerBoot", () => ({
  useWebContainerBoot: () => ({
    status: "fallback" as const,
    isReady: false,
    isSyncing: false,
    typesReady: false,
    error: null,
    runPlay: vi.fn(),
    interruptPlay: vi.fn(),
    syncToContainer: vi.fn(),
    syncToContainerDebounced: vi.fn(),
    flushSync: vi.fn(),
  }),
}));

// Monaco and the visualizer bring a canvas and a worker to a test that is only
// about state; the editor still renders the program selector it is given.
vi.mock("@/components/editor/MultiModelEditor", () => ({
  MultiModelEditor: ({ headerExtra }: { headerExtra: ReactNode }) => (
    <div>{headerExtra}</div>
  ),
}));
vi.mock("@/components/editor/WebContainerLogsPanel", () => ({
  WebContainerLogsPanel: () => null,
}));
vi.mock("@/components/visualizer/VisualizerPanel", () => ({
  VisualizerPanel: () => null,
}));
// react-resizable-panels measures a layout jsdom does not have.
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => null,
}));

function status() {
  return screen.getAllByTestId("playback-status")[0].textContent;
}

/** The desktop and mobile layouts each render a selector; they share state. */
function programSelect() {
  return screen.getAllByRole("combobox", { name: "" })[0];
}

describe("MainLayout program switching", () => {
  beforeEach(() => {
    currentRun = null;
    handleReset.mockClear();
    localStorage.clear();
  });

  it("goes back to idle when the program is switched after a run finished", async () => {
    const user = userEvent.setup();
    render(<MainLayout />);

    await user.click(screen.getAllByRole("button", { name: "Run" })[0]);
    expect(status()).toBe("running");

    await act(async () => {
      currentRun?.resolve();
    });
    expect(status()).toBe("finished");

    await user.selectOptions(programSelect(), "multiStep");

    expect(status()).toBe("idle");
    expect(handleReset).toHaveBeenCalled();
  });

  it("cancels a run in flight and lands on idle when the program is switched mid-run", async () => {
    const user = userEvent.setup();
    render(<MainLayout />);

    await user.click(screen.getAllByRole("button", { name: "Run" })[0]);
    expect(status()).toBe("running");

    await user.selectOptions(programSelect(), "multiStep");

    expect(status()).toBe("idle");
    expect(handleReset).toHaveBeenCalled();

    // The cancelled run settles the way a completed one does, and must not
    // report "finished" over the program that replaced it.
    await act(async () => {
      currentRun?.resolve();
    });
    expect(status()).toBe("idle");
  });
});
