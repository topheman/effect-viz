/**
 * Whether the WebContainer console shows the control commands the page sends
 * the container, which the process's terminal echoes back.
 *
 * The answer survives a reload: someone who turned the internals on is usually
 * looking into how the thing works, and will want them again.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "effect-viz-show-internals";

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
