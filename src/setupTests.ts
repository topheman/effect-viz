import "@testing-library/jest-dom/vitest"; // Extend Vitest's expect
import { vi } from "vitest";

// Mock ResizeObserver for Radix UI components
const ResizeObserverMock = vi.fn(
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  },
);

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
