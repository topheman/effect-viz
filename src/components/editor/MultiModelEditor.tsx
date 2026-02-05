import { useState } from "react";

import { CodeEditor } from "@/components/editor/CodeEditor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface EditorTab {
  id: string;
  title: string;
  source: string;
}

interface MultiModelEditorProps {
  tabs: EditorTab[];
  defaultTabId?: string;
  headerExtra?: React.ReactNode;
  className?: string;
  /**
   * Controlled mode: when provided with onValueChange, the active tab is
   * driven by the parent. Omit to use internal state.
   */
  value?: string;
  onValueChange?: (tabId: string) => void;
}

/**
 * Tabbed code editor backed by a single Monaco instance with multiple models.
 * Uses the multi-model API so each tab keeps its own view state (scroll, selection, undo).
 * @see https://github.com/suren-atoyan/monaco-react?tab=readme-ov-file#multi-model-editor
 */
export function MultiModelEditor({
  tabs,
  defaultTabId,
  headerExtra,
  className,
  value: controlledValue,
  onValueChange,
}: MultiModelEditorProps) {
  const firstTabId = tabs[0]?.id ?? "";
  const [internalTabId, setInternalTabId] = useState(
    defaultTabId ?? firstTabId,
  );

  const isControlled = controlledValue !== undefined;
  const activeTabId = isControlled ? controlledValue : internalTabId;

  const handleValueChange = (tabId: string) => {
    if (!isControlled) setInternalTabId(tabId);
    onValueChange?.(tabId);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const editorPath = activeTab ? `${activeTab.id}.ts` : "";
  const editorValue = activeTab?.source ?? "";

  return (
    <Tabs
      value={activeTabId}
      onValueChange={handleValueChange}
      className={className}
    >
      <div
        className={`
          flex shrink-0 items-center justify-between gap-2 border-b
          border-border bg-muted/50 px-4 py-2
        `}
      >
        <TabsList variant="line" className="h-auto justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {headerExtra}
      </div>
      <div className="mt-0 flex-1 overflow-hidden">
        <CodeEditor
          path={editorPath}
          value={editorValue}
          readOnly
          className="h-full"
        />
      </div>
    </Tabs>
  );
}
