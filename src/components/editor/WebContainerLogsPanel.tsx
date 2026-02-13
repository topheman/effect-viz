import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useRef, useEffect } from "react";

import { cn } from "@/lib/utils";
import { useWebContainerLogsStore } from "@/stores/webContainerLogsStore";

interface WebContainerLogsPanelProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export function WebContainerLogsPanel({
  expanded = true,
  onToggle,
}: WebContainerLogsPanelProps) {
  const { logs, clear } = useWebContainerLogsStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-t border-border bg-muted/30",
        !expanded && "min-h-0",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between border-b border-border",
          "bg-muted/50 px-3 py-1.5",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 text-xs font-medium",
            `
              text-muted-foreground transition-colors
              hover:text-foreground
            `,
          )}
        >
          WebContainer
          {expanded ? (
            <ChevronDownIcon className="size-3.5" aria-hidden />
          ) : (
            <ChevronUpIcon className="size-3.5" aria-hidden />
          )}
        </button>
        {expanded && logs.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className={cn(
              "text-xs text-muted-foreground underline-offset-2",
              "hover:text-foreground hover:underline",
            )}
          >
            Clear
          </button>
        )}
      </div>
      {expanded && (
        <div
          ref={scrollRef}
          className={cn(
            "h-48 min-h-0 overflow-x-auto overflow-y-auto p-2",
            "font-mono text-xs",
          )}
        >
          {logs.length === 0 ? (
            <p className="text-muted-foreground">No logs yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {logs.map((entry, i) => (
                <div
                  key={`${entry.timestamp ?? i}-${i}`}
                  className="flex gap-2 break-all"
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      entry.label === "boot" && "bg-primary/20 text-primary",
                      entry.label === "npm" && "bg-amber-500/20 text-amber-700",
                    )}
                  >
                    {entry.label}
                  </span>
                  <span className="text-muted-foreground">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
