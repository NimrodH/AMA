/**
 * Server-side PDF text extraction utility.
 * Uses pdf-parse to extract plain text from a PDF buffer.
 * Returns null if extraction fails or yields no text.
 */

/**
 * Extract plain text from a PDF buffer.
 * Returns null if extraction fails or the result is empty.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string | null> {
  try {
    // Dynamic import to keep this server-only
    const pdfParse = (await import("pdf-parse")) as unknown as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    const text = data.text?.trim();
    return text || null;
  } catch (err) {
    console.error("[pdf-extract] Failed to extract text from PDF:", err);
    return null;
  }
}
