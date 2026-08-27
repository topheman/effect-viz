import { useCallback, useState } from "react";

/**
 * Playback speed, in virtual milliseconds per wall millisecond.
 *
 * 1 is real time; lower values stretch the program's own sense of time so every
 * sleep, timeout and schedule delay scales by the same factor. See
 * `workshop/phase-10.md`.
 */
export const SPEED_OPTIONS = [1, 0.75, 0.5, 0.25] as const;

export type Speed = (typeof SPEED_OPTIONS)[number];

export const DEFAULT_SPEED: Speed = 1;

const STORAGE_KEY = "effect-flow-speed";

function isSpeed(value: unknown): value is Speed {
  return SPEED_OPTIONS.some((option) => option === value);
}

function readStored(): Speed {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_SPEED;
    const parsed: unknown = JSON.parse(raw);
    return isSpeed(parsed) ? parsed : DEFAULT_SPEED;
  } catch {
    return DEFAULT_SPEED;
  }
}

/** Speed survives a reload: someone who chose 0.25x wants it on the next run too. */
export function useSpeed(): [Speed, (speed: Speed) => void] {
  const [speed, setSpeedState] = useState<Speed>(readStored);

  const setSpeed = useCallback((next: Speed) => {
    setSpeedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a full quota: the speed simply will not persist.
    }
  }, []);

  return [speed, setSpeed];
}

/** `0.25` → `"0.25x"` */
export function formatSpeed(speed: Speed): string {
  return `${speed}x`;
}
