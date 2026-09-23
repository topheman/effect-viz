import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLogView } from "@/hooks/useLogView";
import { TraceStoreProvider, useTraceStore } from "@/stores/traceStore";
import type { TraceEvent } from "@/types/trace";

import { ExecutionLog } from "./ExecutionLog";

const events: TraceEvent[] = [
  { type: "fiber:fork", fiberId: "#0", label: "#0", timestamp: 0 },
  {
    type: "fiber:fork",
    fiberId: "#1",
    parentId: "#0",
    forkedBy: "#0",
    label: "#1",
    timestamp: 0,
  },
  {
    type: "fiber:fork",
    fiberId: "#2",
    parentId: "#0",
    forkedBy: "#1",
    label: "#2",
    timestamp: 0,
  },
  {
    type: "effect:start",
    id: "a",
    fiberId: "#1",
    label: "on-child",
    timestamp: 0,
  },
];

function Seed() {
  const { addEvent } = useTraceStore();
  useEffect(() => events.forEach(addEvent), [addEvent]);
  return null;
}

function indentOf(text: string) {
  return screen.getByText(text).parentElement?.style.paddingInlineStart;
}

async function toggleOption(name: string) {
  await userEvent.click(
    screen.getAllByRole("button", { name: /Log options/ })[0],
  );
  await userEvent.click(screen.getByRole("checkbox", { name }));
  await userEvent.keyboard("{Escape}");
}

function primaryPointer(pointer: "fine" | "coarse") {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query === `(pointer: ${pointer})`,
        media: query,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  resetLogView();
  primaryPointer("fine");
});

describe("ExecutionLog", () => {
  beforeAll(() => {
    Element.prototype.scrollTo ??= () => {};
  });

  it("indents each event by its fiber's depth until flattened", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    expect(indentOf("fiber:forked #0 (root)")).toBe("0px");
    expect(indentOf("effect:started on-child")).toBe("16px");

    await toggleOption("Indent by fiber");

    expect(indentOf("effect:started on-child")).toBe("0px");
  });

  it("names the forking fiber when it is not the parent", () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    expect(screen.getByText("fiber:forked #1 (parent #0)")).toBeInTheDocument();
    expect(
      screen.getByText("fiber:forked #2 (parent #0, by #1)"),
    ).toBeInTheDocument();
  });
});

describe("ExecutionLog hints", () => {
  beforeAll(() => {
    Element.prototype.scrollTo ??= () => {};
  });

  it("expands a hint under its row", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    const icon = screen.getAllByRole("button", {
      name: "Explain this event",
    })[0];
    expect(icon).toHaveAttribute("title", "Explain this event");

    await userEvent.click(icon);

    expect(icon).toHaveAttribute("aria-expanded", "true");
    expect(icon).toHaveAttribute("title", "Hide explanation");
    expect(
      screen.getByText("Indented with the fiber that forked it", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("toggles a hint by tapping its row on touch devices only", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    const row = screen.getByText("fiber:forked #1 (parent #0)");

    await userEvent.click(row);
    expect(
      screen.queryByRole("button", { expanded: true }),
    ).not.toBeInTheDocument();

    primaryPointer("coarse");
    await userEvent.click(row);
    expect(
      screen.getByRole("button", {
        name: "Explain this event",
        expanded: true,
      }),
    ).toBeInTheDocument();
  });

  it("hides every hint icon once hints are turned off", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    await toggleOption("Explain events");

    expect(
      screen.queryByRole("button", { name: "Explain this event" }),
    ).not.toBeInTheDocument();
  });
});

describe("ExecutionLog filters", () => {
  beforeAll(() => {
    Element.prototype.scrollTo ??= () => {};
  });

  it("hides a group's rows and says how many are hidden", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    await toggleOption("Fiber lifecycle 3");

    expect(
      screen.queryByText("fiber:forked #0 (root)"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("effect:started on-child")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log options, 3 hidden" }),
    ).toBeInTheDocument();
  });

  it("keeps both layouts' logs on the same view", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    await toggleOption("Spans 1");

    expect(screen.queryAllByText("effect:started on-child")).toHaveLength(0);
  });
});
