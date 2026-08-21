import { afterEach, describe, expect, it } from "vitest";

import { installDateShim } from "@/runtime/dateShim";
import { VirtualClock } from "@/runtime/virtualClock";

const ORIGIN = 1_600_000_000_000;

let uninstall: (() => void) | null = null;

/** Frozen clock: virtual time cannot drift mid-assertion. */
function installFrozen(origin = ORIGIN) {
  const virtual = new VirtualClock({ rate: 0, origin });
  uninstall = installDateShim(virtual);
  return virtual;
}

afterEach(() => {
  uninstall?.();
  uninstall = null;
});

describe("installDateShim", () => {
  describe("reads virtual time", () => {
    it("overrides Date.now()", () => {
      installFrozen();
      expect(Date.now()).toBe(ORIGIN);
    });

    it("overrides the zero-argument constructor", () => {
      installFrozen();
      expect(new Date().getTime()).toBe(ORIGIN);
    });

    it("overrides Date() called without new", () => {
      installFrozen();
      expect(Date()).toBe(new Date(ORIGIN).toString());
    });

    it("follows the clock when it is advanced", () => {
      const virtual = installFrozen();
      expect(Date.now()).toBe(ORIGIN);

      virtual.sleep(5000, () => {});
      virtual.advanceToNextDeadline();

      expect(Date.now()).toBe(ORIGIN + 5000);
      expect(new Date().getTime()).toBe(ORIGIN + 5000);
    });

    it("returns whole milliseconds", () => {
      const virtual = new VirtualClock({ rate: 0, origin: ORIGIN + 0.7 });
      uninstall = installDateShim(virtual);
      expect(Number.isInteger(Date.now())).toBe(true);
      expect(Date.now()).toBe(ORIGIN);
    });
  });

  describe("leaves explicit dates alone", () => {
    it("keeps new Date(ms)", () => {
      installFrozen();
      expect(new Date(0).getTime()).toBe(0);
      expect(new Date(12345).getTime()).toBe(12345);
    });

    it("keeps the multi-argument constructor", () => {
      installFrozen();
      const date = new Date(2020, 0, 15);
      expect(date.getFullYear()).toBe(2020);
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(15);
    });

    it("keeps the string constructor", () => {
      installFrozen();
      expect(new Date("2020-01-01T00:00:00.000Z").toISOString()).toBe(
        "2020-01-01T00:00:00.000Z",
      );
    });
  });

  describe("stays a faithful Date", () => {
    it("keeps the static helpers", () => {
      installFrozen();
      expect(Date.parse("2020-01-01T00:00:00.000Z")).toBe(1577836800000);
      expect(Date.UTC(2020, 0, 1)).toBe(1577836800000);
    });

    it("keeps instanceof and the prototype methods", () => {
      installFrozen();
      const date = new Date();
      expect(date).toBeInstanceOf(Date);
      expect(typeof date.toISOString()).toBe("string");
      expect(date.toISOString()).toBe(new Date(ORIGIN).toISOString());
    });
  });

  describe("leaves the rest of the platform alone", () => {
    it("does not touch performance.now()", () => {
      installFrozen();
      const before = performance.now();
      // Busy-wait: real time passes while virtual time is frozen.
      while (performance.now() === before) {
        /* spin */
      }

      expect(performance.now()).toBeGreaterThan(before);
      expect(Date.now()).toBe(ORIGIN); // unmoved
    });
  });

  describe("uninstall", () => {
    it("restores the original Date", () => {
      const RealDate = globalThis.Date;
      const restore = installDateShim(
        new VirtualClock({ rate: 0, origin: ORIGIN }),
      );
      expect(Date.now()).toBe(ORIGIN);

      restore();
      expect(globalThis.Date).toBe(RealDate);
      expect(Date.now()).not.toBe(ORIGIN);
    });
  });

  describe("the clock does not read its own shim", () => {
    it("keeps reading wall time from a clock created after the shim", () => {
      installFrozen();

      // The default host reads `performance`, never `Date`, so this cannot
      // recurse into the shim regardless of module evaluation order.
      const later = new VirtualClock({ rate: 0 });
      const wall = performance.timeOrigin + performance.now();

      expect(later.now()).not.toBe(ORIGIN);
      expect(Math.abs(later.now() - wall)).toBeLessThan(1000);
    });
  });
});
