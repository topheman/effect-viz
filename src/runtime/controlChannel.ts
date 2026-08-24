/**
 * The wire between the page and a program running in the WebContainer.
 *
 * The in-browser fallback holds its `Stepper` in a ref and calls it directly.
 * The container runs the program in another process, so the same three verbs —
 * pause, resume, step — have to travel as messages: commands in on the process's
 * stdin, replies out on its stdout, one JSON object per line.
 *
 * Replies exist for two reasons. A step returns a `StepOutcome`, which is what
 * tells the user a program is stuck rather than merely slow. And every reply
 * carries the clock's virtual now, because the page draws a timeline cursor
 * between events and cannot otherwise see a step that moved virtual time: a step
 * over a five second sleep jumps the clock by five seconds in one go, which no
 * amount of extrapolating from a rate will predict. See `workshop/phase-10.md`.
 *
 * Speed is deliberately not on the wire. It is fixed for the life of a run on
 * both paths — the container reads it once from `VIZ_RATE` at spawn — so a live
 * rate command would give the container path a capability the fallback does not
 * have.
 */
import type { StepOutcome, Stepper } from "@/runtime/stepper";
import type { VirtualClock } from "@/runtime/virtualClock";

/** Page → container. */
export type ControlCommand =
  | { readonly cmd: "pause" }
  | { readonly cmd: "resume" }
  | { readonly cmd: "step" };

/**
 * Container → page. `virtualNow` is the authoritative reading of the container's
 * clock at the moment the command finished being applied.
 */
export type ControlReply =
  /** Sent once, when the runner can accept commands. */
  | { readonly reply: "ready"; readonly virtualNow: number }
  | { readonly reply: "pause"; readonly virtualNow: number }
  | { readonly reply: "resume"; readonly virtualNow: number }
  | {
      readonly reply: "step";
      readonly virtualNow: number;
      readonly outcome: StepOutcome;
    };

/**
 * Replies share stdout with trace events and with anything the program itself
 * prints, so they are prefixed the same way `TRACE_EVENT:` is.
 */
export const CONTROL_REPLY_PREFIX = "TRACE_CONTROL:";

const COMMANDS = ["pause", "resume", "step"] as const;

export function encodeCommand(command: ControlCommand): string {
  return `${JSON.stringify(command)}\n`;
}

/** Returns null for anything unrecognised, so junk on stdin cannot crash a run. */
export function decodeCommand(line: string): ControlCommand | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const cmd = (parsed as { cmd?: unknown }).cmd;
  return COMMANDS.some((known) => known === cmd)
    ? ({ cmd } as ControlCommand)
    : null;
}

export function encodeReply(reply: ControlReply): string {
  return `${CONTROL_REPLY_PREFIX}${JSON.stringify(reply)}\n`;
}

export function decodeReply(line: string): ControlReply | null {
  if (!line.startsWith(CONTROL_REPLY_PREFIX)) return null;
  const json = line.slice(CONTROL_REPLY_PREFIX.length).trim();
  if (json === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { reply, virtualNow } = parsed as {
    reply?: unknown;
    virtualNow?: unknown;
  };
  if (typeof virtualNow !== "number" || !Number.isFinite(virtualNow)) {
    return null;
  }
  if (reply === "ready" || reply === "pause" || reply === "resume") {
    return { reply, virtualNow };
  }
  if (reply === "step") {
    const outcome = (parsed as { outcome?: unknown }).outcome;
    if (typeof outcome !== "object" || outcome === null) return null;
    if (typeof (outcome as { _tag?: unknown })._tag !== "string") return null;
    return { reply, virtualNow, outcome: outcome as StepOutcome };
  }
  return null;
}

export interface ControlTarget {
  readonly stepper: Stepper;
  /** Read for `virtualNow`; the stepper drives it but does not expose it. */
  readonly clock: VirtualClock;
}

/**
 * Run one command against the runtime and describe what happened.
 *
 * Trace events emitted while a step runs are written to stdout during
 * `step()`, so they reach the page ahead of the reply that accounts for them.
 * The page can therefore snap its clock forward knowing it has already seen
 * everything that happened before that reading.
 */
export function applyCommand(
  command: ControlCommand,
  { stepper, clock }: ControlTarget,
): ControlReply {
  switch (command.cmd) {
    case "pause":
      stepper.pause();
      return { reply: "pause", virtualNow: clock.now() };
    case "resume":
      stepper.play();
      return { reply: "resume", virtualNow: clock.now() };
    case "step": {
      const outcome = stepper.step();
      return { reply: "step", virtualNow: clock.now(), outcome };
    }
  }
}

/**
 * Reassembles lines from stream chunks, which split wherever they please — a
 * command can arrive in two pieces, and two commands can arrive as one chunk.
 */
export function makeLineReader(onLine: (line: string) => void) {
  let buffer = "";
  return (chunk: string): void => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      onLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  };
}
