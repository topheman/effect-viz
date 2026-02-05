import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  className?: string;
  readOnly?: boolean;
  /**
   * Model path for multi-model support. When set, the editor reuses models by path
   * and preserves view state (scroll, selection, undo) when switching.
   * @see https://github.com/suren-atoyan/monaco-react#multi-model-editor
   */
  path?: string;
}

export function CodeEditor({
  value = "",
  onChange,
  className,
  readOnly = false,
  path,
}: CodeEditorProps) {
  return (
    <div className={className}>
      <Editor
        height="100%"
        defaultLanguage="typescript"
        theme="vs-dark"
        path={path}
        value={value}
        defaultValue={value}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          padding: { top: 16, bottom: 16 },
          readOnly,
          domReadOnly: readOnly,
        }}
      />
    </div>
  );
}
