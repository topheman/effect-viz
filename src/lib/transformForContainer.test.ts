import { describe, expect, it } from "vitest";

import { transformImportsForContainer } from "./transformForContainer";

describe("transformImportsForContainer", () => {
  it("replaces @/runtime/tracedRunner with ./tracedRunner.js", () => {
    const source = `import { Effect } from "effect";
import { withTrace } from "@/runtime/tracedRunner";

export const rootEffect = Effect.succeed("Hello");
export const requirements = [];
`;
    const result = transformImportsForContainer(source);
    expect(result).toContain('from "./tracedRunner.js"');
    expect(result).not.toContain("@/runtime/tracedRunner");
  });

  it("replaces @/ paths with ./tracedRunner.js", () => {
    const source = `import { forkWithTrace } from "@/runtime/tracedRunner";`;
    const result = transformImportsForContainer(source);
    expect(result).toBe('import { forkWithTrace } from "./tracedRunner.js";');
  });

  it("replaces ./tracedRunner with ./tracedRunner.js", () => {
    const source = `import { Effect } from "./tracedRunner";`;
    const result = transformImportsForContainer(source);
    expect(result).toBe('import { Effect } from "./tracedRunner.js";');
  });

  it("leaves program content unchanged aside from imports", () => {
    const source = `import { Effect } from "effect";
import { withTrace } from "@/runtime/tracedRunner";

export const rootEffect = Effect.gen(function* () {
  yield* withTrace(Effect.succeed(1), "step");
  return "done";
});
export const requirements = [];
`;
    const result = transformImportsForContainer(source);
    expect(result).toContain("export const rootEffect");
    expect(result).toContain("export const requirements = []");
    expect(result).toContain('yield* withTrace(Effect.succeed(1), "step")');
  });
});
