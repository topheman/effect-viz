/**
 * The playback shortcuts, in one place because two very different mechanisms
 * have to agree on them: a window listener for the page (see
 * `useKeyboardShortcuts`) and Monaco's own keybinding service for the editor
 * (see `CodeEditor`), which resolves presses itself and never lets them bubble.
 *
 * `Cmd/Ctrl+Enter` for Run is what the TypeScript Sandbox, CodeSandbox and
 * Observable all use, so it is the nearest thing to a convention for a code
 * sandbox. Step is the same key one modifier further out, which keeps the pair
 * learnable and lets a step repeat by holding the modifiers and tapping Enter.
 */
export type ShortcutId = "playPause" | "step";

interface PlatformOption {
  /** Overrides platform detection, so both branches are testable. */
  apple?: boolean;
}

/** Only the parts of a key press the shortcuts look at. */
type KeyPress = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/**
 * Whether the primary modifier is Cmd rather than Ctrl — the same split Monaco
 * makes with `KeyMod.CtrlCmd`, so the editor and the page stay in agreement.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  // `userAgentData` is Chromium-only and not in lib.dom, hence the local shape.
  const { userAgentData } = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = userAgentData?.platform;
  if (typeof platform === "string" && platform.length > 0) {
    return /mac/i.test(platform);
  }
  // `navigator.platform` is deprecated but is still the only reading Safari and
  // Firefox offer; iPadOS answers "MacIntel", which is the right answer here.
  return /mac|iphone|ipad|ipod/i.test(
    navigator.platform || navigator.userAgent,
  );
}

/**
 * Whether a press is the given shortcut. The primary modifier is matched
 * exclusively, so a press holding both Cmd and Ctrl belongs to neither platform
 * and fires nothing.
 */
export function matchesShortcut(
  id: ShortcutId,
  event: KeyPress,
  options: PlatformOption = {},
): boolean {
  // Checked first so that ordinary typing, which this sees every keystroke of,
  // costs one comparison.
  if (event.key !== "Enter") return false;
  if (event.altKey) return false;
  const apple = options.apple ?? isApplePlatform();
  const hasPrimary = apple
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!hasPrimary) return false;
  return event.shiftKey === (id === "step");
}

/** The shortcut as a reader sees it, for tooltips and help text. */
export function formatShortcut(
  id: ShortcutId,
  options: PlatformOption = {},
): string {
  const apple = options.apple ?? isApplePlatform();
  const withShift = id === "step";
  if (apple) return `${withShift ? "⇧" : ""}⌘↵`;
  return `Ctrl+${withShift ? "Shift+" : ""}Enter`;
}

/**
 * The shortcut in the notation `aria-keyshortcuts` expects. Only the modifier
 * the platform actually uses is announced, so a Windows user is not read a Mac
 * binding they cannot press.
 */
export function ariaKeyShortcuts(
  id: ShortcutId,
  options: PlatformOption = {},
): string {
  const apple = options.apple ?? isApplePlatform();
  const parts = [apple ? "Meta" : "Control"];
  if (id === "step") parts.push("Shift");
  parts.push("Enter");
  return parts.join("+");
}
