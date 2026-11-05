// Adds the DOM matchers (toBeInTheDocument, toBeDisabled, toHaveAttribute, ...) to Vitest's expect,
// and their types to every file in src. Loaded by vitest.config.ts through setupFiles.
import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine; the rich-text editor (ProseMirror) calls these while typing.
if (typeof Range !== 'undefined') {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
  Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => rect;
}
if (typeof document !== 'undefined') document.elementFromPoint ??= () => null;
