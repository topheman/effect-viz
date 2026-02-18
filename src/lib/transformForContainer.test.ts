import { describe, expect, it } from "vitest";

import { transformForContainer } from "./transformForContainer";

describe("transformForContainer", () => {
  it("injects perf instrumentation when perfEnabled", () => {
    const source = `import { Effect } from "effect";
import { runProgramWithTrace, makeTraceEmitterLayer } from "@/runtime/tracedRunner";

const program = Effect.succeed("Hello");
const traced = runProgramWithTrace(program, "basic");
const layer = makeTraceEmitterLayer((event) => {});
Effect.runFork(traced.pipe(Effect.provide(layer)));
`;
    const result = transformForContainer(source, true);
    expect(result).toContain("PERF: ready");
    expect(result).toContain("performance.now()");
    expect(result).toMatch(/\s*Effect\.runFork\s*\(/);
  });

  it("omits perf instrumentation when perfDisabled", () => {
    const source = `import { Effect } from "effect";
import { runProgramWithTrace, makeTraceEmitterLayer } from "@/runtime/tracedRunner";

const program = Effect.succeed("Hello");
const traced = runProgramWithTrace(program, "basic");
const layer = makeTraceEmitterLayer((event) => {});
Effect.runFork(traced.pipe(Effect.provide(layer)));
`;
    const result = transformForContainer(source, false);
    expect(result).not.toContain("PERF:");
    expect(result).toContain(
      "Effect.runFork(traced.pipe(Effect.provide(layer)))",
    );
  });

  it("handles tracedProgram variable name", () => {
    const source = `import { Effect } from "effect";
import { runProgramWithTrace, makeTraceEmitterLayer } from "@/runtime/tracedRunner";

const program = Effect.succeed(1);
const tracedProgram = runProgramWithTrace(program, "multiStep");
const layer = makeTraceEmitterLayer((event) => {});
const tracedProgramWithLayer = tracedProgram.pipe(Effect.provide(layer));
Effect.runFork(tracedProgramWithLayer);
`;
    const result = transformForContainer(source, false);
    expect(result).toContain('runProgramWithTrace(program, "user")');
    expect(result).toContain("TRACE_EVENT:");
  });

  it("injects before const fiber = Effect.runFork(...)", () => {
    const source = `const tracedProgramWithLayer = tracedProgram.pipe(Effect.provide(layer));
const fiber = Effect.runFork(tracedProgramWithLayer);
`;
    const result = transformForContainer(source, true);
    expect(result).toContain("PERF: ready");
    expect(result).toContain("const fiber = Effect.runFork");
  });
});
