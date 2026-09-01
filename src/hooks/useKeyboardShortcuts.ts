import { useEffect, useRef } from "react";

import { matchesShortcut } from "@/lib/keyboardShortcuts";

interface KeyboardShortcutHandlers {
  onPlayPause: () => void;
  onStep: () => void;
}

/**
 * Binds the playback shortcuts everywhere on the page except inside Monaco.
 * Monaco resolves its own keybindings on its DOM node and stops these presses
 * from bubbling, so it registers the same two actions itself; see
 * `registerPlaybackActions` in `CodeEditor`.
 *
 * Handlers are read through a ref so the listener is attached once and still
 * calls the current closure: its caller rebuilds them every render.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // A held chord would queue steps faster than a WebContainer round trip
      // can answer them.
      if (event.repeat) return;
      // Monaco owns these presses in the editor, and running a program behind
      // an open modal is not what the press meant.
      if (
        event.target instanceof Element &&
        event.target.closest('.monaco-editor, [role="dialog"]')
      ) {
        return;
      }
      if (matchesShortcut("playPause", event)) {
        event.preventDefault();
        handlersRef.current.onPlayPause();
        return;
      }
      if (matchesShortcut("step", event)) {
        event.preventDefault();
        handlersRef.current.onStep();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
