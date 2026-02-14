/**
 * Pure helpers for per-program editor cache (session-only).
 * Used when switching programs: save current edits, load cached or template.
 */

import type { ProgramKey } from "@/lib/programs";

export type { ProgramKey };
export type ProgramsMap = Record<ProgramKey, { source: string }>;

/**
 * Result of switching from one program to another.
 * - newContent: content to show in editor
 * - updatedCache: cache after saving current and loading for new program
 */
export interface ProgramSwitchResult {
  newContent: string;
  updatedCache: Partial<Record<ProgramKey, string>>;
}

/**
 * Compute new editor content and cache when switching programs.
 * Saves current content to cache for currentKey, loads from cache or template for newKey.
 */
export function computeProgramSwitch(
  currentKey: ProgramKey,
  newKey: ProgramKey,
  currentContent: string,
  cache: Partial<Record<ProgramKey, string>>,
  programs: ProgramsMap,
): ProgramSwitchResult {
  const updatedCache = { ...cache };
  updatedCache[currentKey] = currentContent;

  const newContent = updatedCache[newKey] ?? programs[newKey].source;

  return { newContent, updatedCache };
}

/**
 * Compute new content and cache when resetting current program to template.
 */
export function computeResetToTemplate(
  programKey: ProgramKey,
  programs: ProgramsMap,
  cache: Partial<Record<ProgramKey, string>>,
): { newContent: string; updatedCache: Partial<Record<ProgramKey, string>> } {
  const template = programs[programKey].source;
  const updatedCache = { ...cache };
  updatedCache[programKey] = template;
  return { newContent: template, updatedCache };
}
