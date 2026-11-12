/**
 * Parsing JSON returned by the OpenAI model.
 *
 * Hebrew abbreviations are written with a double quote (gershayim), e.g.
 * מע"מ, גמ"ח, חו"ל. The model sometimes leaves that quote unescaped inside a
 * JSON string, which ends the string early and breaks the whole response.
 */

/** Cut the outermost {...} out of the text (drops code fences and prose). */
export function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  return text.trim();
}

/** Escape double quotes that sit between two Hebrew letters (מע"מ → מע\"מ). */
function escapeHebrewAbbreviationQuotes(json: string): string {
  return json.replace(/([א-ת])"(?=[א-ת])/g, '$1\\"');
}

/**
 * Parse the model's JSON output. Returns undefined when it can't be parsed,
 * even after escaping the quotes of Hebrew abbreviations.
 */
export function parseModelJson(text: string): unknown {
  const json = extractJson(text);
  try {
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(escapeHebrewAbbreviationQuotes(json));
    } catch {
      return undefined;
    }
  }
}
