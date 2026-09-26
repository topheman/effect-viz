import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";

import { type ProgramKey, programs } from "@/lib/programs";

import { AUTO_START_DELAY_MS, MainLayout } from "./MainLayout";

/** The run in flight: `handlePlay` returns a promise the test settles itself. */
let currentRun: {
  resolve: () => void;
  reject: (error: unknown) => void;
} | null = null;
const handleReset = vi.fn();
/** The program each run was started with, as passed to `handlePlay`. */
const playedPrograms: (ProgramKey | undefined)[] = [];
/** Set to hold a run's first event back; the test then calls it. */
let firstChunk: { held: boolean; release?: () => void } = { held: false };

vi.mock("@/hooks/useEventHandlers", () => ({
  useEventHandlers: () => {
    const [selectedProgram, setSelectedProgram] = useState<ProgramKey>("basic");
    return {
      handlePlay: ({
        onFirstChunk,
        programKey,
      }: {
        onFirstChunk: () => void;
        programKey?: ProgramKey;
      }) => {
        playedPrograms.push(programKey);
        if (firstChunk.held) firstChunk.release = onFirstChunk;
        else onFirstChunk();
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

// The editor stub still renders the program selector it is given.
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

/** The desktop and mobile layouts each render one; they share state. */
function programSelect() {
  return screen.getAllByRole("combobox", { name: "" })[0];
}

describe("MainLayout program switching", () => {
  beforeEach(() => {
    currentRun = null;
    playedPrograms.length = 0;
    firstChunk = { held: false };
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

  it("goes back to idle when the program is switched while paused", async () => {
    const user = userEvent.setup();
    render(<MainLayout />);

    await user.click(screen.getAllByRole("button", { name: "Run" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Pause" })[0]);
    expect(status()).toBe("paused");

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

    // A cancelled run settles the way a completed one does.
    await act(async () => {
      currentRun?.resolve();
    });
    expect(status()).toBe("idle");
  });

  it("runs the new program once the switch settles", async () => {
    const user = userEvent.setup();
    render(<MainLayout />);

    await user.selectOptions(programSelect(), "multiStep");
    expect(status()).toBe("idle");

    await waitFor(() => expect(status()).toBe("running"));
    expect(playedPrograms).toEqual(["multiStep"]);
  });

  it("runs only the last program when several are passed through quickly", async () => {
    // Fake timers, so a slow runner cannot let the first switch settle. fireEvent
    // rather than user-event: RTL's async wrapper awaits a timer vitest has faked.
    vi.useFakeTimers();
    try {
      render(<MainLayout />);

      fireEvent.change(programSelect(), { target: { value: "multiStep" } });
      fireEvent.change(programSelect(), { target: { value: "basic" } });
      expect(playedPrograms).toEqual([]);

      await act(() => vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS));
      expect(status()).toBe("running");
      expect(playedPrograms).toEqual(["basic"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a run started by Step in starting until its first event", async () => {
    const user = userEvent.setup();
    render(<MainLayout />);
    firstChunk = { held: true };

    await user.click(screen.getAllByRole("button", { name: "Step" })[0]);
    expect(status()).toBe("starting...");
    expect(screen.getAllByRole("button", { name: "Run" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Step" })[0]).toBeDisabled();

    act(() => firstChunk.release?.());
    expect(status()).toBe("paused");
    expect(screen.getAllByRole("button", { name: "Run" })[0]).toBeEnabled();
  });
});
