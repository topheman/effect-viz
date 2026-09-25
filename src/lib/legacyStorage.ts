/**
 * Moves preferences saved under the project's former name, effect-flow, to
 * their effect-viz keys, so returning visitors keep their settings and do not
 * replay the onboarding tour.
 *
 * Imported from `main.tsx` before the app: `useShowInternals` reads its key
 * when its module is evaluated, so the move has to happen first.
 */
const RENAMED_KEYS = [
  ["effect-flow-onboarding", "effect-viz-onboarding"],
  ["effect-flow-show-internals", "effect-viz-show-internals"],
  ["effect-flow-speed", "effect-viz-speed"],
] as const;

export function migrateLegacyStorage(): void {
  try {
    for (const [legacy, current] of RENAMED_KEYS) {
      const value = localStorage.getItem(legacy);
      if (value == null) continue;
      if (localStorage.getItem(current) == null) {
        localStorage.setItem(current, value);
      }
      localStorage.removeItem(legacy);
    }
  } catch {
    // Private browsing: there is nothing to carry over.
  }
}

migrateLegacyStorage();
