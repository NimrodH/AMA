/**
 * Shared Lexical content utilities.
 * Used by both the editor (cards.tsx) and the read-only viewer (learn.tsx).
 */

/**
 * Converts a plain-text string into a serialized Lexical editor state.
 * Each newline becomes a separate paragraph node so formatting is preserved.
 * If the string is already a Lexical JSON blob (starts with `{"root"`),
 * it is returned as-is.
 */
export function toEditorState(text: string): string {
  if (!text) return "";
  if (text.trimStart().startsWith('{"root"')) return text;
  const paragraphs = text.split("\n").map((line) => ({
    children: line
      ? [{ detail: 0, format: 0, mode: "normal", style: "", text: line, type: "text", version: 1 }]
      : [],
    direction: "rtl",
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  }));
  return JSON.stringify({
    root: {
      children: paragraphs,
      direction: "rtl",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });
}

/**
 * Extracts the plain-text representation from a Lexical editor state JSON.
 * Falls back to the original string if it's already plain text.
 */
export function fromEditorState(serialized: string): string {
  if (!serialized) return "";
  if (!serialized.trimStart().startsWith('{"root"')) return serialized;
  try {
    const state = JSON.parse(serialized) as {
      root: { children: Array<{ children?: Array<{ text?: string }> }> };
    };
    return state.root.children
      .map((para) => (para.children ?? []).map((n) => n.text ?? "").join(""))
      .join("\n");
  } catch {
    return serialized;
  }
}
