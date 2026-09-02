/**
 * Page-side half of the control channel: turns button clicks into commands and
 * waits for the container to answer.
 *
 * The in-browser path calls its `Stepper` directly and gets a `StepOutcome`
 * back on the spot. Here the same call is a round trip, so `step` returns a
 * promise that a reply resolves. Everything the UI does with a step — deciding
 * whether the program is stuck, whether it has finished — needs that outcome,
 * which is why the channel has a return path at all.
 *
 * The controller outlives any single run: `attach` is called when a process
 * starts and `detach` when it goes away, so a click that lands between runs is
 * dropped rather than throwing.
 */
import type { ControlCommand, ControlReply } from "@/runtime/controlChannel";
import type { StepOutcome } from "@/runtime/stepper";

/** Resolves to null when the run ends before the container answers. */
type PendingStep = (outcome: StepOutcome | null) => void;

export class ContainerController {
  #send: ((command: ControlCommand) => void) | null = null;
  /** Steps awaiting a reply, oldest first. Replies answer them in order. */
  #pending: PendingStep[] = [];

  get isAttached(): boolean {
    return this.#send !== null;
  }

  attach(send: (command: ControlCommand) => void): void {
    this.#send = send;
  }

  /** The process is gone: nothing can answer, so settle whoever is waiting. */
  detach(): void {
    this.#send = null;
    this.#settleAll();
  }

  handleReply(reply: ControlReply): void {
    if (reply.reply !== "step") return;
    this.#pending.shift()?.(reply.outcome);
  }

  pause(): void {
    this.#send?.({ cmd: "pause" });
  }

  play(): void {
    // A pending step can never be answered now: resuming is what the user chose
    // instead of waiting for it.
    this.#settleAll();
    this.#send?.({ cmd: "resume" });
  }

  /**
   * Retune the running program. Nothing in the UI waits on the outcome, so
   * unlike `step` this needs no promise; the reply still matters, because it is
   * what tells the mirrored clock when the container actually changed slope.
   */
  setRate(rate: number): void {
    this.#send?.({ cmd: "setRate", rate });
  }

  step(): Promise<StepOutcome | null> {
    if (this.#send === null) return Promise.resolve(null);
    return new Promise<StepOutcome | null>((resolve) => {
      this.#pending.push(resolve);
      this.#send?.({ cmd: "step" });
    });
  }

  #settleAll(): void {
    const pending = this.#pending;
    this.#pending = [];
    for (const resolve of pending) resolve(null);
  }
}
