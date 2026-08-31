import { Schema } from "effect";
import { useCallback, useSyncExternalStore } from "react";

const ONBOARDING_STORAGE_KEY = "effect-flow-onboarding";
const ONBOARDING_VERSION = Number(import.meta.env.VITE_ONBOARDING_VERSION) || 1;

const OnboardingStep = Schema.Literal(
  "play",
  "showVisualizer",
  "programSelect",
  "info",
  "step",
  "speed",
);
type OnboardingStep = Schema.Schema.Type<typeof OnboardingStep>;

const OnboardingStored = Schema.Struct({
  completed: OnboardingStep,
  version: Schema.Number,
  date: Schema.String,
});
type OnboardingStored = Schema.Schema.Type<typeof OnboardingStored>;

/**
 * The tour, in the order it is walked. `since` is the onboarding version that
 * introduced the step, which is how a returning visitor is shown a step added
 * after their last visit without replaying the tour they already finished.
 * Progress is stored as a single version number, so two steps sharing a `since`
 * cannot be told apart: give each new step a version of its own.
 */
const STEPS: readonly { id: OnboardingStep; since: number }[] = [
  { id: "play", since: 1 },
  { id: "showVisualizer", since: 1 },
  { id: "step", since: 2 },
  { id: "speed", since: 3 },
  { id: "programSelect", since: 1 },
  { id: "info", since: 1 },
];

const STEPS_ORDER: OnboardingStep[] = STEPS.map((step) => step.id);

/**
 * The step to show next: the first one the visitor has neither completed nor
 * had the chance to see. A step is unseen when it comes after the last one they
 * completed, or when it was added after the version they stored.
 */
function getNextStep(stored: OnboardingStored): OnboardingStep | null {
  const completedIdx = STEPS_ORDER.indexOf(stored.completed);
  if (completedIdx < 0) return STEPS_ORDER[0];
  const next = STEPS.find(
    (step, idx) => idx > completedIdx || step.since > stored.version,
  );
  return next?.id ?? null;
}

function readStored(): OnboardingStored | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Schema.decodeUnknownSync(OnboardingStored)(parsed);
  } catch {
    return null;
  }
}

function getCurrentStepFromStorage(): OnboardingStep | null {
  const stored = readStored();
  if (stored == null) return STEPS_ORDER[0];
  return getNextStep(stored);
}

function getSnapshot(): OnboardingStep | null {
  return getCurrentStepFromStorage();
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === ONBOARDING_STORAGE_KEY && e.storageArea === localStorage) {
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * The version to store once `reached` has been walked to: high enough to retire
 * the steps the visitor has now seen, low enough to keep the ones added behind
 * their position that they have not. Storing the current version outright would
 * drop a second back-inserted step, since it is only ever shown while the stored
 * version is older than the one that introduced it.
 */
function getStoredVersion(
  storedVersion: number,
  reached: OnboardingStep,
  justCompleted: OnboardingStep,
): number {
  const reachedIdx = STEPS_ORDER.indexOf(reached);
  const pending = STEPS.filter(
    (step, idx) =>
      idx <= reachedIdx &&
      step.since > storedVersion &&
      step.id !== justCompleted,
  );
  if (pending.length === 0) return ONBOARDING_VERSION;
  return Math.min(...pending.map((step) => step.since)) - 1;
}

function writeStored(completed: OnboardingStep, version: number): void {
  const value: OnboardingStored = {
    completed,
    version,
    date: new Date().toISOString(),
  };
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(value));
  listeners.forEach((l) => l());
}

function clearStored(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  listeners.forEach((l) => l());
}

export type OnboardingStepId = OnboardingStep;

export function useOnboarding(): {
  currentStep: OnboardingStep | null;
  completeStep: (stepId: OnboardingStepId) => void;
  restartOnboarding: () => void;
  isActive: boolean;
} {
  const currentStep = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const completeStep = useCallback((stepId: OnboardingStepId) => {
    if (!STEPS_ORDER.includes(stepId)) return;
    const current = getCurrentStepFromStorage();
    if (current === null) return; // onboarding already completed
    if (current !== stepId) return; // only advance when completing the current step
    // A step added behind the visitor's position is shown out of order, so keep
    // the furthest one they have reached: writing the earlier id would walk them
    // back through the tour they already finished.
    const stored = readStored();
    const reached =
      stored != null &&
      STEPS_ORDER.indexOf(stored.completed) > STEPS_ORDER.indexOf(stepId)
        ? stored.completed
        : stepId;
    const storedVersion = stored?.version ?? ONBOARDING_VERSION;
    writeStored(reached, getStoredVersion(storedVersion, reached, stepId));
  }, []);

  const restartOnboarding = useCallback(() => {
    clearStored();
  }, []);

  return {
    currentStep,
    completeStep,
    restartOnboarding,
    isActive: currentStep !== null,
  };
}
