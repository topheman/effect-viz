import Editor, { type Monaco } from "@monaco-editor/react";
import type * as MonacoTypes from "monaco-editor";
import { useEffect, useRef } from "react";

const MARKER_OWNER = "typescript";

interface TsDiagnostic {
  start?: number;
  length?: number;
  messageText: string | { messageText: string; next?: unknown[] };
  category: number;
}

function categoryToSeverity(category: number): MonacoTypes.MarkerSeverity {
  switch (category) {
    case 1:
      return 8; // Error
    case 0:
      return 4; // Warning
    case 2:
      return 1; // Hint
    case 3:
      return 2; // Info
    default:
      return 2;
  }
}

function flattenMessage(
  messageText: string | { messageText: string; next?: unknown[] },
): string {
  if (typeof messageText === "string") return messageText;
  return messageText.messageText;
}

function diagnosticToMarker(
  diag: TsDiagnostic,
  model: MonacoTypes.editor.ITextModel,
): MonacoTypes.editor.IMarkerData {
  const start = diag.start ?? 0;
  const length = diag.length ?? 0;
  const startPos = model.getPositionAt(start);
  const endPos = model.getPositionAt(
    Math.min(start + length, model.getValueLength()),
  );
  return {
    severity: categoryToSeverity(diag.category),
    message: flattenMessage(diag.messageText),
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column,
  };
}

/**
 * Re-runs TypeScript diagnostics on all models and updates editor markers (squiggles).
 * Needed because Monaco does not auto re-validate when addExtraLib injects types after models exist.
 */
async function revalidateModels(monaco: Monaco) {
  const models = monaco.editor.getModels();
  const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
  for (const model of models) {
    if (model.getLanguageId() !== "typescript") continue; // skip JSON, etc.
    const worker = await getWorker(model.uri);
    const uriStr = model.uri.toString();
    // syntactic: parse errors; semantic: type errors (unknown module, etc.)
    const [syntactic, semantic] = await Promise.all([
      worker.getSyntacticDiagnostics(uriStr),
      worker.getSemanticDiagnostics(uriStr),
    ]);
    // Convert offset-based diagnostics to line/column markers
    const markers: MonacoTypes.editor.IMarkerData[] = [
      ...(syntactic as TsDiagnostic[]).map((d) => diagnosticToMarker(d, model)),
      ...(semantic as TsDiagnostic[]).map((d) => diagnosticToMarker(d, model)),
    ];
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers); // refresh squiggles
  }
}

interface CodeEditorProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  className?: string;
  readOnly?: boolean;
  /**
   * When true, type acquisition has completed. Triggers re-validation of all models.
   */
  typesReady?: boolean;
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
  typesReady = false,
}: CodeEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    if (typesReady && monacoRef.current) {
      revalidateModels(monacoRef.current);
    }
  }, [typesReady]);

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
          monacoRef.current = monaco;
        }}
        onMount={(_, monaco) => {
          monacoRef.current = monaco;
          if (typesReady) {
            revalidateModels(monaco);
          }
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
