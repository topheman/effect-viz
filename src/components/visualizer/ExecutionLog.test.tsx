import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeAll, describe, expect, it } from "vitest";

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

describe("ExecutionLog", () => {
  beforeAll(() => {
    Element.prototype.scrollTo ??= () => {};
  });

  it("indents each event by its fiber's depth on request", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    expect(indentOf("effect:started on-child")).toBe("0px");

    await userEvent.click(
      screen.getByRole("button", { name: "indent by fiber" }),
    );

    expect(indentOf("fiber:forked #0 (root)")).toBe("0px");
    expect(indentOf("effect:started on-child")).toBe("16px");
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

  it("expands a hint under its row once explaining is on", async () => {
    render(
      <TraceStoreProvider>
        <Seed />
        <ExecutionLog />
      </TraceStoreProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Explain this event" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "indent by fiber" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "explain" }));
    await userEvent.click(
      screen.getAllByRole("button", { name: "Explain this event" })[0],
    );

    expect(
      screen.getByRole("button", {
        name: "Explain this event",
        expanded: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Indented with the fiber that forked it", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });
});
