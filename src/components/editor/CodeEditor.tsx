import Editor, { type Monaco } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";

// typescriptDefaults is global (shared by all editors), so we add the extra lib only once
// to avoid duplicate declarations. API: LanguageServiceDefaults.addExtraLib
const BUNDLED_TYPES_URL = "/editor-bundled-definitions.d.ts";
const BUNDLED_TYPES_PATH = "ts:editor-bundled-definitions.d.ts";

let bundledTypesPromise: Promise<string> | null = null;
let extraLibAdded = false;

function getBundledTypesContent(): Promise<string> {
  if (!bundledTypesPromise) {
    bundledTypesPromise = fetch(BUNDLED_TYPES_URL).then((r) => r.text());
  }
  return bundledTypesPromise;
}

/**
 * Adds the bundled .d.ts to Monaco's TypeScript defaults.
 * Must be called synchronously in beforeMount so the extra lib is present before
 * any model is created — otherwise the first-open model is validated without it
 * and Monaco does not re-validate when extra libs are added later.
 */
function addBundledTypesToMonaco(monaco: Monaco, content: string): void {
  if (extraLibAdded) return;
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    content,
    BUNDLED_TYPES_PATH,
  );
  extraLibAdded = true;
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
  const [typesReady, setTypesReady] = useState(false);
  const typesContentRef = useRef<string | null>(null);

  useEffect(() => {
    getBundledTypesContent().then((content) => {
      typesContentRef.current = content;
      setTypesReady(true);
    });
  }, []);

  if (!typesReady) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="text-sm text-muted-foreground">Loading editor…</span>
      </div>
    );
  }

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
        beforeMount={(monaco) => {
          const content = typesContentRef.current;
          if (content) addBundledTypesToMonaco(monaco, content);
        }}
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
