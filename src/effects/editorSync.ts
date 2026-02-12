/**
 * Effect that syncs editor content to the WebContainer.
 * Consumes a stream of content changes, debounces 2s, transforms, and writes to program.ts.
 */
import { Effect, Stream } from "effect";

import { transformForContainer } from "@/lib/transformForContainer";
import { WebContainer } from "@/services/webcontainer";

const DEBOUNCE_MS = 2000;
const PROGRAM_PATH = "program.ts";

/**
 * Run editor-to-container sync.
 * Consumes the content stream, debounces, transforms, and writes.
 */
export function runEditorSync(contentStream: Stream.Stream<string>) {
  return Effect.gen(function* () {
    const wc = yield* WebContainer;
    yield* contentStream.pipe(
      Stream.debounce(DEBOUNCE_MS),
      Stream.runForEach((content) =>
        Effect.gen(function* () {
          const transformed = transformForContainer(content);
          yield* wc.writeFile(PROGRAM_PATH, transformed);
        }),
      ),
    );
  });
}
