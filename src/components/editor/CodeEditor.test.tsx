import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "./CodeEditor";

type SelectionListener = (e: {
  source: string;
  selection: { isEmpty: () => boolean };
}) => void;

const runShowHover = vi.fn();
let onSelection: SelectionListener | undefined;
const fakeEditor = {
  addAction: vi.fn(),
  getAction: (id: string) =>
    id === "editor.action.showHover" ? { run: runShowHover } : null,
  onDidChangeCursorSelection: (listener: SelectionListener) => {
    onSelection = listener;
  },
};

vi.mock("@monaco-editor/react", async () => {
  const { useEffect } = await import("react");
  return {
    default: function Editor({
      onMount,
    }: {
      onMount?: (editor: unknown, monaco: unknown) => void;
    }) {
      useEffect(() => {
        onMount?.(fakeEditor, {
          KeyMod: { CtrlCmd: 0, Shift: 0 },
          KeyCode: { Enter: 0 },
        });
      }, [onMount]);
      return null;
    },
  };
});

function setPointer(coarse: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: coarse && query === "(pointer: coarse)",
        media: query,
      }) as MediaQueryList,
  );
}

const caret = { isEmpty: () => true };
const range = { isEmpty: () => false };

describe("CodeEditor tap to hover", () => {
  beforeEach(() => {
    runShowHover.mockClear();
    onSelection = undefined;
  });

  it("shows the hover when a tap places the cursor", () => {
    setPointer(true);
    render(<CodeEditor />);
    onSelection?.({ source: "mouse", selection: caret });
    expect(runShowHover).toHaveBeenCalledOnce();
  });

  it("ignores cursor moves from the keyboard and long-press selections", () => {
    setPointer(true);
    render(<CodeEditor />);
    onSelection?.({ source: "keyboard", selection: caret });
    onSelection?.({ source: "mouse", selection: range });
    expect(runShowHover).not.toHaveBeenCalled();
  });

  it("leaves mouse users to Monaco's own hover", () => {
    setPointer(false);
    render(<CodeEditor />);
    expect(onSelection).toBeUndefined();
  });
});
