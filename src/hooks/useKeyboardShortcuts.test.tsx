import { fireEvent, render, screen } from "@testing-library/react";

import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

interface HarnessProps {
  onPlayPause: () => void;
  onStep: () => void;
}

function Harness(props: HarnessProps) {
  useKeyboardShortcuts(props);
  return (
    <>
      {/* Monaco's own class, which is what the hook looks for. */}
      {/* eslint-disable-next-line better-tailwindcss/no-unregistered-classes */}
      <div className="monaco-editor">
        <textarea data-testid="in-editor" />
      </div>
      <div role="dialog">
        <button data-testid="in-dialog" type="button" />
      </div>
      <button data-testid="elsewhere" type="button" />
    </>
  );
}

describe("useKeyboardShortcuts", () => {
  const onPlayPause = vi.fn();
  const onStep = vi.fn();

  beforeEach(() => {
    onPlayPause.mockClear();
    onStep.mockClear();
    // jsdom reports no platform, and the fallback would then read a user agent
    // that differs per machine. Pin it so the tests exercise the Ctrl branch.
    Object.defineProperty(window.navigator, "platform", {
      value: "Win32",
      configurable: true,
    });
  });

  it("runs or pauses on Ctrl+Enter", () => {
    render(<Harness onPlayPause={onPlayPause} onStep={onStep} />);

    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    expect(onPlayPause).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
  });

  it("steps on Ctrl+Shift+Enter", () => {
    render(<Harness onPlayPause={onPlayPause} onStep={onStep} />);

    fireEvent.keyDown(document.body, {
      key: "Enter",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it("ignores a bare Enter", () => {
    render(<Harness onPlayPause={onPlayPause} onStep={onStep} />);

    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(onPlayPause).not.toHaveBeenCalled();
    expect(onStep).not.toHaveBeenCalled();
  });

  it("ignores a held chord, which would outrun a container round trip", () => {
    render(<Harness onPlayPause={onPlayPause} onStep={onStep} />);

    fireEvent.keyDown(document.body, {
      key: "Enter",
      ctrlKey: true,
      repeat: true,
    });

    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it("leaves presses inside the editor to Monaco", () => {
    render(<Harness onPlayPause={onPlayPause} onStep={onStep} />);

    fireEvent.keyDown(screen.getByTestId("in-editor"), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it("does nothing while a modal has focus", () => {
    render(<Harness onPlayPause={onPlayPause} onStep={onStep} />);

    fireEvent.keyDown(screen.getByTestId("in-dialog"), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it("calls the current handler after a re-render", () => {
    const { rerender } = render(
      <Harness onPlayPause={onPlayPause} onStep={onStep} />,
    );
    const later = vi.fn();
    rerender(<Harness onPlayPause={later} onStep={onStep} />);

    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    expect(later).toHaveBeenCalledTimes(1);
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(
      <Harness onPlayPause={onPlayPause} onStep={onStep} />,
    );
    unmount();

    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    expect(onPlayPause).not.toHaveBeenCalled();
  });
});
