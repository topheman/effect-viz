import {
  ariaKeyShortcuts,
  formatShortcut,
  matchesShortcut,
} from "./keyboardShortcuts";

/** A key press with nothing held, to be narrowed per case. */
function press(
  overrides: Partial<
    Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">
  > = {},
) {
  return {
    key: "Enter",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

const apple = { apple: true };
const other = { apple: false };

describe("matchesShortcut", () => {
  it("matches Cmd+Enter as play/pause on Apple platforms", () => {
    expect(matchesShortcut("playPause", press({ metaKey: true }), apple)).toBe(
      true,
    );
    expect(matchesShortcut("step", press({ metaKey: true }), apple)).toBe(
      false,
    );
  });

  it("matches Cmd+Shift+Enter as step on Apple platforms", () => {
    expect(
      matchesShortcut("step", press({ metaKey: true, shiftKey: true }), apple),
    ).toBe(true);
    expect(
      matchesShortcut(
        "playPause",
        press({ metaKey: true, shiftKey: true }),
        apple,
      ),
    ).toBe(false);
  });

  it("matches Ctrl+Enter and Ctrl+Shift+Enter elsewhere", () => {
    expect(matchesShortcut("playPause", press({ ctrlKey: true }), other)).toBe(
      true,
    );
    expect(
      matchesShortcut("step", press({ ctrlKey: true, shiftKey: true }), other),
    ).toBe(true);
  });

  it("ignores the other platform's modifier", () => {
    expect(matchesShortcut("playPause", press({ ctrlKey: true }), apple)).toBe(
      false,
    );
    expect(matchesShortcut("playPause", press({ metaKey: true }), other)).toBe(
      false,
    );
  });

  it("ignores a press holding both modifiers", () => {
    const both = press({ metaKey: true, ctrlKey: true });
    expect(matchesShortcut("playPause", both, apple)).toBe(false);
    expect(matchesShortcut("playPause", both, other)).toBe(false);
  });

  it("ignores Alt, which belongs to some other binding", () => {
    expect(
      matchesShortcut(
        "playPause",
        press({ metaKey: true, altKey: true }),
        apple,
      ),
    ).toBe(false);
  });

  it("ignores a bare Enter and any other key", () => {
    expect(matchesShortcut("playPause", press(), apple)).toBe(false);
    expect(
      matchesShortcut("playPause", press({ key: "a", metaKey: true }), apple),
    ).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("reads as symbols on Apple platforms and words elsewhere", () => {
    expect(formatShortcut("playPause", apple)).toBe("⌘↵");
    expect(formatShortcut("step", apple)).toBe("⇧⌘↵");
    expect(formatShortcut("playPause", other)).toBe("Ctrl+Enter");
    expect(formatShortcut("step", other)).toBe("Ctrl+Shift+Enter");
  });
});

describe("ariaKeyShortcuts", () => {
  it("announces only the modifier the platform uses", () => {
    expect(ariaKeyShortcuts("playPause", apple)).toBe("Meta+Enter");
    expect(ariaKeyShortcuts("step", apple)).toBe("Meta+Shift+Enter");
    expect(ariaKeyShortcuts("playPause", other)).toBe("Control+Enter");
    expect(ariaKeyShortcuts("step", other)).toBe("Control+Shift+Enter");
  });
});
