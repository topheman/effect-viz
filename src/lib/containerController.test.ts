import { describe, expect, it } from "vitest";

import { ContainerController } from "@/lib/containerController";
import type { ControlCommand } from "@/runtime/controlChannel";

function setup() {
  const controller = new ContainerController();
  const sent: ControlCommand[] = [];
  controller.attach((command) => sent.push(command));
  return { controller, sent };
}

describe("ContainerController", () => {
  it("sends pause and resume without waiting for an answer", () => {
    const { controller, sent } = setup();

    controller.pause();
    controller.play();

    expect(sent).toEqual([{ cmd: "pause" }, { cmd: "resume" }]);
  });

  it("resolves a step with the outcome the container reports", async () => {
    const { controller, sent } = setup();

    const stepped = controller.step();
    expect(sent).toEqual([{ cmd: "step" }]);
    controller.handleReply({
      reply: "step",
      virtualNow: 10,
      outcome: { _tag: "released", tasks: 2 },
    });

    await expect(stepped).resolves.toEqual({ _tag: "released", tasks: 2 });
  });

  it("answers steps in the order they were sent", async () => {
    const { controller } = setup();

    const first = controller.step();
    const second = controller.step();
    controller.handleReply({
      reply: "step",
      virtualNow: 1,
      outcome: { _tag: "released", tasks: 1 },
    });
    controller.handleReply({
      reply: "step",
      virtualNow: 2,
      outcome: { _tag: "noProgress" },
    });

    await expect(first).resolves.toEqual({ _tag: "released", tasks: 1 });
    await expect(second).resolves.toEqual({ _tag: "noProgress" });
  });

  it("ignores replies that are not answers to a step", async () => {
    const { controller } = setup();
    const stepped = controller.step();

    controller.handleReply({ reply: "ready", virtualNow: 0 });
    controller.handleReply({ reply: "pause", virtualNow: 1 });
    controller.handleReply({
      reply: "step",
      virtualNow: 2,
      outcome: { _tag: "finished" },
    });

    await expect(stepped).resolves.toEqual({ _tag: "finished" });
  });

  it("resolves a step that will never be answered when the process goes away", async () => {
    const { controller } = setup();

    const stepped = controller.step();
    controller.detach();

    await expect(stepped).resolves.toBeNull();
    expect(controller.isAttached).toBe(false);
  });

  it("abandons a pending step when the user resumes instead", async () => {
    const { controller } = setup();

    const stepped = controller.step();
    controller.play();

    await expect(stepped).resolves.toBeNull();
  });

  it("drops clicks that land between runs", async () => {
    const controller = new ContainerController();

    controller.pause();
    await expect(controller.step()).resolves.toBeNull();
  });
});
