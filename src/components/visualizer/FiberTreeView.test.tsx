import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { resetChangesPanel } from "@/hooks/useChangesPanel";
import {
  clearLogTarget,
  targetedIndex,
  useLogTarget,
} from "@/hooks/useLogTarget";
import { resetLogView, updateLogView } from "@/hooks/useLogView";
import {
  resetVisualizerTab,
  setVisualizerTab,
  useVisualizerTab,
} from "@/hooks/useVisualizerTab";
import type { PlaybackState } from "@/lib/playbackAvailability";
import { FiberStoreProvider, useFiberStore } from "@/stores/fiberStore";
import { TraceStoreProvider, useTraceStore } from "@/stores/traceStore";
import type { TraceEvent } from "@/types/trace";

import { FiberTreeView } from "./FiberTreeView";

const fork = (fiberId: string, parentId?: string): TraceEvent => ({
  type: "fiber:fork",
  fiberId,
  parentId,
  label: fiberId,
  timestamp: 0,
});

/** A child that starts at once, then a retry that sleeps for zero. */
const twoChanges: TraceEvent[] = [
  fork("#1"),
  fork("#2", "#1"),
  { type: "fiber:resume", fiberId: "#2", timestamp: 0 },
  { type: "fiber:suspend", fiberId: "#1", timestamp: 0 },
  { type: "fiber:resume", fiberId: "#1", timestamp: 0 },
  {
    type: "retry:attempt",
    id: "task",
    fiberId: "#1",
    label: "task",
    attempt: 1,
    lastError: "boom",
    timestamp: 0,
  },
];

function Seed({ events }: { events: TraceEvent[] }) {
  const { addEvent } = useTraceStore();
  const { processEvent } = useFiberStore();
  useEffect(() => {
    for (const event of events) {
      addEvent(event);
      processEvent(event);
    }
  }, [addEvent, processEvent, events]);
  return null;
}

/** Shows what the shared stores hold, for the assertions. */
function Probe() {
  const { events } = useTraceStore();
  const target = targetedIndex(useLogTarget(), events);
  const [tab] = useVisualizerTab();
  return (
    <output data-testid="probe">
      {tab} {target ?? "none"}
    </output>
  );
}

function renderTree(
  events: TraceEvent[],
  playbackState: PlaybackState = "finished",
) {
  return render(
    <TraceStoreProvider>
      <FiberStoreProvider>
        <Seed events={events} />
        <FiberTreeView playbackState={playbackState} />
        <Probe />
      </FiberStoreProvider>
    </TraceStoreProvider>,
  );
}

const changesButton = () =>
  screen.getByRole("button", { name: /^What changed in Effect 4/ });

beforeEach(() => {
  resetChangesPanel();
  resetLogView();
  resetVisualizerTab();
  clearLogTarget();
});

describe("FiberTreeView changes", () => {
  it("shows no button when the trace shows no change", () => {
    renderTree([fork("#1"), fork("#2", "#1")]);
    expect(
      screen.queryByRole("button", { name: /^What changed in Effect 4/ }),
    ).not.toBeInTheDocument();
  });

  it("counts kinds of change, not occurrences", () => {
    renderTree(twoChanges);
    expect(changesButton()).toHaveAccessibleName(
      "What changed in Effect 4, 2 changes",
    );
    expect(changesButton()).toHaveTextContent("v3 → v4 · 2");
  });

  it("replaces the tree with the changes, and the same button goes back", async () => {
    renderTree(twoChanges);

    await userEvent.click(changesButton());
    expect(
      screen.getByRole("heading", { name: "What changed in Effect 4" }),
    ).toBeVisible();
    expect(screen.queryAllByTestId("fiber-node")).toEqual([]);
    expect(screen.getByText("An operator's fork runs at once")).toBeVisible();
    expect(screen.getByText("A retry sleeps for zero")).toBeVisible();

    await userEvent.click(changesButton());
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("fiber-node")).toHaveLength(2);
  });

  it("highlights the fibers of the selected change in the tree", async () => {
    renderTree(twoChanges);
    await userEvent.click(changesButton());
    await userEvent.click(
      screen.getByRole("button", { name: "A retry sleeps for zero" }),
    );
    await userEvent.click(changesButton());

    const highlighted = screen
      .getAllByTestId("fiber-node")
      .filter((node) => node.hasAttribute("data-highlighted"))
      .map((node) => node.textContent);
    expect(highlighted).toEqual(["[running]#1"]);
  });

  it("links each row to the log by the number the log shows, on the log tab", async () => {
    updateLogView({ hidden: new Set(["lifecycle"]) });
    setVisualizerTab("fibers");
    renderTree(twoChanges);
    await userEvent.click(changesButton());

    await userEvent.click(
      screen.getByRole("button", { name: "Row 3 in the Execution Log" }),
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("log 4");
  });

  it("skips the rows the log hides", async () => {
    updateLogView({ hidden: new Set(["scheduling"]) });
    renderTree(twoChanges);
    await userEvent.click(changesButton());

    const links = screen
      .getAllByRole("button", { name: /in the Execution Log$/ })
      .map((link) => link.getAttribute("aria-label"));
    expect(links).toEqual(["Row 2 in the Execution Log"]);
  });

  it("keeps row links inactive while the run is playing", async () => {
    renderTree(twoChanges, "running");
    await userEvent.click(changesButton());

    const link = screen.getByRole("button", {
      name: "Row 2 in the Execution Log",
    });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAccessibleDescription(
      "Pause to follow a row to the log.",
    );
    await userEvent.click(link);
    expect(screen.getByTestId("probe")).toHaveTextContent(/ none$/);
  });
});
