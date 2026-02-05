import Editor, { type Monaco } from "@monaco-editor/react";

// typescriptDefaults is global (shared by all editors), so we add the extra lib only once
// to avoid duplicate declarations. API: LanguageServiceDefaults.addExtraLib
const BUNDLED_TYPES_URL = "/editor-bundled-definitions.d.ts";
let bundledTypesPromise: Promise<string> | null = null;
let extraLibAdded = false;

function getBundledTypesContent(): Promise<string> {
  if (!bundledTypesPromise) {
    bundledTypesPromise = fetch(BUNDLED_TYPES_URL).then((r) => r.text());
  }
  return bundledTypesPromise;
}

function addBundledTypesToMonaco(monaco: Monaco): void {
  getBundledTypesContent().then((content) => {
    if (extraLibAdded) return;
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      content,
      "ts:editor-bundled-definitions.d.ts",
    );
    extraLibAdded = true;
  });
}

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
        beforeMount={addBundledTypesToMonaco}
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
