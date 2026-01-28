import Editor from "@monaco-editor/react";

const DEFAULT_CODE = `// Write your Effect code here
import { Effect } from "effect";

const program = Effect.succeed("Hello, Effect!");

// Run the program
Effect.runPromise(program).then(console.log);
`;

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  className?: string;
}

export function CodeEditor({
  value = DEFAULT_CODE,
  onChange,
  className,
}: CodeEditorProps) {
  return (
    <div className={className}>
      <Editor
        height="100%"
        defaultLanguage="typescript"
        theme="vs-dark"
        value={value}
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
        }}
      />
    </div>
  );
}
