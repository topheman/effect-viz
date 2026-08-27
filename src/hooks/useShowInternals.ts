/**
 * Whether the visualizer shows what *it* is doing, alongside what the program
 * does.
 *
 * Two panels have something to hide. The Execution Log carries the suspend and
 * resume pair produced by the yield injected into a paused start; the console
 * carries the control commands the page sends the container, echoed back by the
 * process's terminal. From the user's side that is one question — am I looking
 * at my program, or at the tool — so it is one preference rather than a
 * checkbox in each panel.
 *
 * Kept outside React because both panels ask independently and must agree. The
 * answer survives a reload: someone who turned the internals on is usually
 * looking into how the thing works, and will want them again.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "effect-flow-show-internals";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private browsing: the preference simply does not persist.
    return false;
  }
}

let showInternals = readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return showInternals;
}

export function setShowInternals(next: boolean): void {
  if (next === showInternals) return;
  showInternals = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // As above: the toggle still works for this session.
  }
  for (const listener of listeners) listener();
}

export function useShowInternals(): [boolean, (next: boolean) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot), setShowInternals];
}
