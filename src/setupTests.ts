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

// Mock matchMedia for InfoModal and other components that use it
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
