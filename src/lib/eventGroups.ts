import type { TraceEvent } from "@/types/trace";

/** Event types grouped by the runtime question they answer. */
export type EventGroup =
  | "spans"
  | "lifecycle"
  | "scheduling"
  | "resources"
  | "retries";

export const EVENT_GROUPS: ReadonlyArray<{ group: EventGroup; label: string }> =
  [
    { group: "spans", label: "Spans" },
    { group: "lifecycle", label: "Fiber lifecycle" },
    { group: "scheduling", label: "Scheduling" },
    { group: "resources", label: "Resources" },
    { group: "retries", label: "Retries" },
  ];

export function eventGroup(event: TraceEvent): EventGroup {
  switch (event.type) {
    case "effect:start":
    case "effect:end":
      return "spans";
    case "fiber:fork":
    case "fiber:end":
    case "fiber:interrupt":
      return "lifecycle";
    case "fiber:suspend":
    case "fiber:resume":
      return "scheduling";
    case "acquire":
    case "finalizer":
      return "resources";
    case "retry:attempt":
      return "retries";
  }
}
