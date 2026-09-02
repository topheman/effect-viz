import { describe, expect, it, vi } from "vitest";

import {
  CONTROL_REPLY_PREFIX,
  type ControlCommand,
  type ControlReply,
  applyCommand,
  decodeCommand,
  decodeReply,
  encodeCommand,
  encodeReply,
  makeLineReader,
} from "@/runtime/controlChannel";
import { GatedScheduler } from "@/runtime/gatedScheduler";
import { Stepper } from "@/runtime/stepper";
import { VirtualClock, type VirtualClockHost } from "@/runtime/virtualClock";

const fakeHost: VirtualClockHost = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function setup({
  isFinished = () => false,
}: { isFinished?: () => boolean } = {}) {
  const scheduler = new GatedScheduler();
  const clock = new VirtualClock({ rate: 1, origin: 0, host: fakeHost });
  const stepper = new Stepper({ scheduler, clock, isFinished });
  return { scheduler, clock, stepper, target: { stepper, clock } };
}

describe("command codec", () => {
  it.each<ControlCommand>([
    { cmd: "pause" },
    { cmd: "resume" },
    { cmd: "step" },
    { cmd: "setRate", rate: 0.25 },
  ])("round-trips %o", (command) => {
    const encoded = encodeCommand(command);
    expect(encoded.endsWith("\n")).toBe(true);
    expect(decodeCommand(encoded)).toEqual(command);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["not json", "pause"],
    ["json but not an object", "42"],
    ["null", "null"],
    ["object without cmd", '{"foo":1}'],
    ["unknown verb", '{"cmd":"explode"}'],
    ["setRate without a rate", '{"cmd":"setRate"}'],
    ["setRate with a non-numeric rate", '{"cmd":"setRate","rate":"fast"}'],
    ["setRate with a negative rate", '{"cmd":"setRate","rate":-1}'],
  ])("returns null for %s", (_label, line) => {
    expect(decodeCommand(line)).toBeNull();
  });
});

describe("reply codec", () => {
  it.each<ControlReply>([
    { reply: "ready", virtualNow: 0 },
    { reply: "pause", virtualNow: 1234.5 },
    { reply: "resume", virtualNow: 9 },
    { reply: "step", virtualNow: 7, outcome: { _tag: "released", tasks: 3 } },
    {
      reply: "step",
      virtualNow: 5000,
      outcome: { _tag: "advancedClock", toVirtual: 5000, tasks: 1 },
    },
    { reply: "step", virtualNow: 2, outcome: { _tag: "noProgress" } },
    { reply: "step", virtualNow: 2, outcome: { _tag: "finished" } },
  ])("round-trips %o", (reply) => {
    const line = encodeReply(reply);
    expect(line.startsWith(CONTROL_REPLY_PREFIX)).toBe(true);
    expect(decodeReply(line.trimEnd())).toEqual(reply);
  });

  it("ignores lines without the prefix, including bare trace events", () => {
    expect(decodeReply('{"reply":"pause","virtualNow":1}')).toBeNull();
    expect(decodeReply('TRACE_EVENT:{"type":"fiber:fork"}')).toBeNull();
  });

  it.each([
    ["malformed json", `${CONTROL_REPLY_PREFIX}{`],
    ["nothing after the prefix", CONTROL_REPLY_PREFIX],
    ["missing virtualNow", `${CONTROL_REPLY_PREFIX}{"reply":"pause"}`],
    [
      "non-numeric virtualNow",
      `${CONTROL_REPLY_PREFIX}{"reply":"pause","virtualNow":"soon"}`,
    ],
    [
      "step without an outcome",
      `${CONTROL_REPLY_PREFIX}{"reply":"step","virtualNow":1}`,
    ],
    [
      "step with an untagged outcome",
      `${CONTROL_REPLY_PREFIX}{"reply":"step","virtualNow":1,"outcome":{}}`,
    ],
    ["unknown reply", `${CONTROL_REPLY_PREFIX}{"reply":"burp","virtualNow":1}`],
  ])("returns null for %s", (_label, line) => {
    expect(decodeReply(line)).toBeNull();
  });
});

describe("applyCommand", () => {
  it("pause freezes the clock and gates the scheduler", () => {
    const { scheduler, clock, target } = setup();

    const reply = applyCommand({ cmd: "pause" }, target);

    expect(reply.reply).toBe("pause");
    expect(scheduler.mode).toBe("paused");
    expect(clock.rate).toBe(0);
  });

  it("resume restores the rate the run started with", () => {
    const { scheduler, clock, target } = setup();
    applyCommand({ cmd: "pause" }, target);

    applyCommand({ cmd: "resume" }, target);

    expect(scheduler.mode).toBe("playing");
    expect(clock.rate).toBe(1);
  });

  it("setRate retunes a running clock and reads it back", () => {
    const { clock, target } = setup();

    const reply = applyCommand({ cmd: "setRate", rate: 0.25 }, target);

    expect(reply).toMatchObject({ reply: "setRate" });
    expect(typeof reply.virtualNow).toBe("number");
    expect(clock.rate).toBe(0.25);
  });

  it("setRate on a paused program is what resume restores", () => {
    const { clock, target } = setup();
    applyCommand({ cmd: "pause" }, target);

    applyCommand({ cmd: "setRate", rate: 0.5 }, target);
    expect(clock.rate).toBe(0);

    applyCommand({ cmd: "resume" }, target);
    expect(clock.rate).toBe(0.5);
  });

  it("reports the outcome of a step", () => {
    const { scheduler, target } = setup();
    applyCommand({ cmd: "pause" }, target);
    const task = vi.fn();
    scheduler.scheduleTask(task, 0);

    const reply = applyCommand({ cmd: "step" }, target);

    expect(task).toHaveBeenCalledOnce();
    expect(reply).toMatchObject({
      reply: "step",
      outcome: { _tag: "released" },
    });
  });

  it("reports noProgress when nothing is runnable and nothing is due", () => {
    const { target } = setup();
    applyCommand({ cmd: "pause" }, target);

    const reply = applyCommand({ cmd: "step" }, target);

    expect(reply).toMatchObject({ outcome: { _tag: "noProgress" } });
  });

  it("carries the clock jump a step over a sleep produces", () => {
    const { clock, target } = setup();
    applyCommand({ cmd: "pause" }, target);
    clock.sleep(5000, () => {});

    const reply = applyCommand({ cmd: "step" }, target);

    // The page cannot predict this from a rate: it is the whole reason replies
    // carry a virtual reading.
    expect(reply).toMatchObject({
      virtualNow: 5000,
      outcome: { _tag: "advancedClock", toVirtual: 5000 },
    });
  });

  it("reports finished without touching the runtime", () => {
    const { scheduler, target } = setup({ isFinished: () => true });
    applyCommand({ cmd: "pause" }, target);
    const task = vi.fn();
    scheduler.scheduleTask(task, 0);

    const reply = applyCommand({ cmd: "step" }, target);

    expect(reply).toMatchObject({ outcome: { _tag: "finished" } });
    expect(task).not.toHaveBeenCalled();
  });
});

describe("makeLineReader", () => {
  it("emits one line per newline, without it", () => {
    const lines: string[] = [];
    const read = makeLineReader((line) => lines.push(line));

    read("a\nb\n");

    expect(lines).toEqual(["a", "b"]);
  });

  it("holds a partial line until its newline arrives", () => {
    const lines: string[] = [];
    const read = makeLineReader((line) => lines.push(line));

    read('{"cmd":"st');
    expect(lines).toEqual([]);

    read('ep"}\n');
    expect(lines).toEqual(['{"cmd":"step"}']);
  });

  it("splits several commands arriving in one chunk", () => {
    const commands: (ControlCommand | null)[] = [];
    const read = makeLineReader((line) => commands.push(decodeCommand(line)));

    read(encodeCommand({ cmd: "step" }) + encodeCommand({ cmd: "resume" }));

    expect(commands).toEqual([{ cmd: "step" }, { cmd: "resume" }]);
  });

  it("does not emit a trailing fragment that never ends", () => {
    const lines: string[] = [];
    const read = makeLineReader((line) => lines.push(line));

    read("done\nunterminated");

    expect(lines).toEqual(["done"]);
  });
});
