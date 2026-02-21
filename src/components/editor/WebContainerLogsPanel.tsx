import AnsiModule from "ansi-to-react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useWebContainerLogsStore } from "@/stores/webContainerLogsStore";

// ansi-to-react is CJS; Vite/ESM may give us { default: Component } instead of
// the component. React expects a function/class, not an object — extract default.
const Ansi =
  (AnsiModule as { default?: ComponentType<{ children?: string }> }).default ??
  AnsiModule;

interface WebContainerLogsPanelProps {
  expanded?: boolean;
  onToggle?: () => void;
  webContainerMode?: boolean;
}

export function WebContainerLogsPanel({
  expanded = true,
  onToggle,
  webContainerMode = true,
}: WebContainerLogsPanelProps) {
  const { logs, clearLogs, clearErrors } = useWebContainerLogsStore();
  const [activeTab, setActiveTab] = useState<"logs" | "errors">("logs");
  const logsScrollRef = useRef<HTMLDivElement>(null);
  const errorsScrollRef = useRef<HTMLDivElement>(null);

  const logEntries = logs.filter((e) => e.label !== "error");
  const errorEntries = logs.filter((e) => e.label === "error");
  const hasLogs = logEntries.length > 0;
  const hasErrors = errorEntries.length > 0;

  const handleClear = () => {
    if (webContainerMode) {
      if (activeTab === "logs") clearLogs();
      else clearErrors();
    } else {
      clearLogs();
    }
  };

  const canClear = webContainerMode
    ? activeTab === "logs"
      ? hasLogs
      : hasErrors
    : hasLogs;

  const scrollToBottom = (el: HTMLDivElement | null) => {
    if (el) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    if (!expanded) return;
    scrollToBottom(logsScrollRef.current);
    scrollToBottom(errorsScrollRef.current);
  }, [logs, expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const ref = activeTab === "logs" ? logsScrollRef : errorsScrollRef;
    scrollToBottom(ref.current);
  }, [activeTab, expanded]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col border-t border-border bg-muted/30",
        expanded && "h-full overflow-hidden",
        !expanded && "min-h-0 flex-none",
      )}
    >
      {expanded ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            webContainerMode && setActiveTab(v as "logs" | "errors")
          }
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            className={cn(
              `
                flex shrink-0 items-center justify-between gap-2 border-b
                border-border
              `,
              "bg-muted/50 px-3 py-1.5",
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={onToggle}
                className={cn(
                  `
                    flex shrink-0 cursor-pointer items-center gap-1.5 text-xs
                    font-medium
                  `,
                  `
                    text-muted-foreground transition-colors
                    hover:text-foreground
                  `,
                )}
              >
                {webContainerMode ? "Console" : "Logs"}
                <ChevronDownIcon className="size-3.5" aria-hidden />
              </button>
              {webContainerMode && (
                <TabsList variant="line" className="h-7 gap-1">
                  <TabsTrigger value="logs" className="px-2 text-xs">
                    Logs
                  </TabsTrigger>
                  <TabsTrigger value="errors" className="px-2 text-xs">
                    Errors
                    {hasErrors && (
                      <span
                        className={`
                          ml-1 rounded bg-destructive/20 px-1 text-[10px]
                        `}
                      >
                        {errorEntries.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              )}
            </div>
            {canClear && (
              <button
                type="button"
                onClick={handleClear}
                className={cn(
                  "shrink-0 text-xs text-muted-foreground underline-offset-2",
                  "hover:text-foreground hover:underline",
                )}
              >
                Clear
              </button>
            )}
          </div>
          <TabsContent
            value="logs"
            className={`
              mt-0 flex h-0 min-h-0 flex-1 flex-col overflow-hidden outline-none
            `}
          >
            <div
              ref={logsScrollRef}
              className={cn(
                "min-h-0 flex-1 overflow-x-auto overflow-y-auto p-2 pb-10",
                "font-mono text-xs",
              )}
            >
              {logEntries.length === 0 ? (
                <p className="text-muted-foreground">No logs yet.</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {logEntries.map((entry, i) =>
                    entry.label === "output" ? (
                      <div
                        key={`${entry.timestamp ?? i}-${i}`}
                        className="bg-muted/30 px-2 py-0.5 break-all"
                      >
                        <Ansi>{entry.message}</Ansi>
                      </div>
                    ) : (
                      <div
                        key={`${entry.timestamp ?? i}-${i}`}
                        className="flex gap-2 break-all"
                      >
                        <span
                          className={cn(
                            `
                              shrink-0 rounded px-1.5 py-0.5 text-[10px]
                              font-medium
                            `,
                            entry.label === "boot" &&
                              "bg-primary/20 text-primary",
                            entry.label === "npm" &&
                              "bg-amber-500/20 text-amber-700",
                          )}
                        >
                          {entry.label}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.message}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </TabsContent>
          {webContainerMode && (
            <TabsContent
              value="errors"
              className={`
                mt-0 flex h-0 min-h-0 flex-1 flex-col overflow-hidden
                outline-none
              `}
            >
              <div
                ref={errorsScrollRef}
                className={cn(
                  "min-h-0 flex-1 overflow-x-auto overflow-y-auto p-2 pb-10",
                  "font-mono text-xs",
                )}
              >
                {errorEntries.length === 0 ? (
                  <p className="text-muted-foreground">No errors.</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {errorEntries.map((entry, i) => (
                      <div
                        key={`${entry.timestamp ?? i}-${i}`}
                        className="bg-destructive/15 px-2 py-0.5 break-all"
                      >
                        <Ansi>{entry.message}</Ansi>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
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
            {webContainerMode ? "Console" : "Logs"}
            <ChevronUpIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
