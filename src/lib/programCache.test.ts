import { describe, expect, it } from "vitest";

import {
  computeProgramSwitch,
  computeResetToTemplate,
  type ProgramKey,
  type ProgramsMap,
} from "./programCache";

const mockPrograms: ProgramsMap = {
  basic: { source: "// basic template" },
  multiStep: { source: "// multiStep template" },
  nestedForks: { source: "// nestedForks template" },
  racing: { source: "// racing template" },
  failureAndRecovery: { source: "// failureAndRecovery template" },
  retry: { source: "// retry template" },
  retryExponentialBackoff: { source: "// retryExponentialBackoff template" },
  basicFinalizers: { source: "// basicFinalizers template" },
  acquireRelease: { source: "// acquireRelease template" },
  loggerWithRequirements: { source: "// loggerWithRequirements template" },
};

describe("programCache", () => {
  describe("computeProgramSwitch", () => {
    it("saves current content to cache and loads template when switching to uncached program", () => {
      const currentContent = "// user edited basic";
      const cache: Partial<Record<ProgramKey, string>> = {};

      const { newContent, updatedCache } = computeProgramSwitch(
        "basic",
        "multiStep",
        currentContent,
        cache,
        mockPrograms,
      );

      expect(newContent).toBe("// multiStep template");
      expect(updatedCache.basic).toBe(currentContent);
      expect(updatedCache.multiStep).toBeUndefined();
    });

    it("loads from cache when switching back to previously edited program", () => {
      const cachedBasic = "// previously edited basic";
      const cache: Partial<Record<ProgramKey, string>> = {
        basic: cachedBasic,
      };

      const { newContent } = computeProgramSwitch(
        "multiStep",
        "basic",
        "// multiStep content",
        cache,
        mockPrograms,
      );

      expect(newContent).toBe(cachedBasic);
    });

    it("preserves other program caches when switching", () => {
      const cache: Partial<Record<ProgramKey, string>> = {
        racing: "// edited racing",
      };

      const { updatedCache } = computeProgramSwitch(
        "basic",
        "multiStep",
        "// basic content",
        cache,
        mockPrograms,
      );

      expect(updatedCache.racing).toBe("// edited racing");
      expect(updatedCache.basic).toBe("// basic content");
    });
  });

  describe("computeResetToTemplate", () => {
    it("returns template content and updates cache", () => {
      const cache: Partial<Record<ProgramKey, string>> = {
        basic: "// user edited basic",
      };

      const { newContent, updatedCache } = computeResetToTemplate(
        "basic",
        mockPrograms,
        cache,
      );

      expect(newContent).toBe("// basic template");
      expect(updatedCache.basic).toBe("// basic template");
    });

    it("preserves other program caches when resetting", () => {
      const cache: Partial<Record<ProgramKey, string>> = {
        basic: "// edited basic",
        multiStep: "// edited multiStep",
      };

      const { updatedCache } = computeResetToTemplate(
        "basic",
        mockPrograms,
        cache,
      );

      expect(updatedCache.basic).toBe("// basic template");
      expect(updatedCache.multiStep).toBe("// edited multiStep");
    });
  });
});
