import { Schema } from "effect";
import { useCallback, useSyncExternalStore } from "react";

const ONBOARDING_STORAGE_KEY = "effect-flow-onboarding";
const ONBOARDING_VERSION = Number(import.meta.env.VITE_ONBOARDING_VERSION) || 1;

const OnboardingStep = Schema.Literal(
  "play",
  "showVisualizer",
  "programSelect",
  "info",
);
type OnboardingStep = Schema.Schema.Type<typeof OnboardingStep>;

const OnboardingStored = Schema.Struct({
  completed: OnboardingStep,
  version: Schema.Number,
  date: Schema.String,
});
type OnboardingStored = Schema.Schema.Type<typeof OnboardingStored>;

const STEPS_ORDER: OnboardingStep[] = [
  "play",
  "showVisualizer",
  "programSelect",
  "info",
];

function getNextStep(completed: OnboardingStep): OnboardingStep | null {
  const idx = STEPS_ORDER.indexOf(completed);
  if (idx < 0 || idx >= STEPS_ORDER.length - 1) return null;
  return STEPS_ORDER[idx + 1];
}

function readStored(): OnboardingStored | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    const decoded = Schema.decodeUnknownSync(OnboardingStored)(parsed);
    if (decoded.version !== ONBOARDING_VERSION) return null;
    return decoded;
  } catch {
    return null;
  }
}

function getCurrentStepFromStorage(): OnboardingStep | null {
  const stored = readStored();
  if (stored == null) return "play";
  const next = getNextStep(stored.completed);
  return next;
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

function writeStored(completed: OnboardingStep): void {
  const value: OnboardingStored = {
    completed,
    version: ONBOARDING_VERSION,
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
    writeStored(stepId);
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
