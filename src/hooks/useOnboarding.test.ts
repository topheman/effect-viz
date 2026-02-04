import { act, renderHook } from "@testing-library/react";

import { useOnboarding } from "./useOnboarding";

const STORAGE_KEY = "effect-flow-onboarding";

function clearOnboardingStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

describe("useOnboarding", () => {
  beforeEach(() => {
    clearOnboardingStorage();
  });

  it("starts at play when no storage", () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.currentStep).toBe("play");
    expect(result.current.isActive).toBe(true);
  });

  it("advances to next step when completeStep is called", () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.currentStep).toBe("play");

    act(() => {
      result.current.completeStep("play");
    });

    expect(result.current.currentStep).toBe("showVisualizer");

    act(() => {
      result.current.completeStep("showVisualizer");
    });

    expect(result.current.currentStep).toBe("programSelect");

    act(() => {
      result.current.completeStep("programSelect");
    });

    expect(result.current.currentStep).toBe("info");

    act(() => {
      result.current.completeStep("info");
    });

    expect(result.current.currentStep).toBe(null);
    expect(result.current.isActive).toBe(false);
  });

  it("persists progress in localStorage", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeStep("play");
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as { completed: string; version: number };
    expect(stored.completed).toBe("play");
    expect(stored.version).toBe(1);
  });

  it("resumes from next step after reload (simulated)", () => {
    const { result: result1 } = renderHook(() => useOnboarding());

    act(() => {
      result1.current.completeStep("play");
    });

    expect(result1.current.currentStep).toBe("showVisualizer");

    // Simulate reload: new hook instance reads from same localStorage
    const { result: result2 } = renderHook(() => useOnboarding());

    expect(result2.current.currentStep).toBe("showVisualizer");
  });

  it("returns null when all steps completed (simulated)", () => {
    const { result: result1 } = renderHook(() => useOnboarding());

    act(() => {
      result1.current.completeStep("play");
      result1.current.completeStep("showVisualizer");
      result1.current.completeStep("programSelect");
      result1.current.completeStep("info");
    });

    expect(result1.current.currentStep).toBe(null);

    const { result: result2 } = renderHook(() => useOnboarding());
    expect(result2.current.currentStep).toBe(null);
    expect(result2.current.isActive).toBe(false);
  });

  it("starts at play when localStorage is malformed", () => {
    localStorage.setItem(STORAGE_KEY, "not valid json");

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.currentStep).toBe("play");
  });

  it("starts at play when stored version does not match", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        completed: "info",
        version: 999,
        date: new Date().toISOString(),
      }),
    );

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.currentStep).toBe("play");
  });

  it("does not go back when completing an earlier step", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeStep("play");
    });
    expect(result.current.currentStep).toBe("showVisualizer");

    act(() => {
      result.current.completeStep("play");
    });
    expect(result.current.currentStep).toBe("showVisualizer");

    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = JSON.parse(raw!) as { completed: string };
    expect(stored.completed).toBe("play");
  });

  it("stays completed when completeStep(earlier) is called after onboarding done", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeStep("play");
      result.current.completeStep("showVisualizer");
      result.current.completeStep("programSelect");
      result.current.completeStep("info");
    });
    expect(result.current.currentStep).toBe(null);

    act(() => {
      result.current.completeStep("play");
    });
    expect(result.current.currentStep).toBe(null);

    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = JSON.parse(raw!) as { completed: string };
    expect(stored.completed).toBe("info");
  });
});
