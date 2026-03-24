import mammoth from "mammoth";

/** Download a file from a public URL and return it as a Buffer. */
export async function fetchFileBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract plain text from a file buffer.
 * Supports DOCX (via mammoth), PDF (via pdf-parse), and plain text files.
 */
export async function extractText(buffer: Buffer, url: string): Promise<string> {
  const lower = url.toLowerCase();

  if (lower.endsWith(".docx")) {
    const rawResult = await mammoth.extractRawText({ buffer });
    if (rawResult.value.trim()) return rawResult.value;
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const plainText = htmlResult.value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plainText;
  }

  if (lower.endsWith(".pdf")) {
    const pdfParseModule = (await import("pdf-parse")) as unknown as
      | { default?: (buf: Buffer) => Promise<{ text: string }> }
      | ((buf: Buffer) => Promise<{ text: string }>);
    const pdfParse =
      (pdfParseModule as { default?: (buf: Buffer) => Promise<{ text: string }> }).default ??
      (pdfParseModule as (buf: Buffer) => Promise<{ text: string }>);
    const data = await pdfParse(buffer);
    return data.text;
  }

  return buffer.toString("utf-8");
}

/**
 * Downloads and extracts text from a file URL. Returns the extracted text
 * or null if the file couldn't be processed.
 */
export async function extractTextFromUrl(fileUrl: string): Promise<string | null> {
  try {
    const buffer = await fetchFileBuffer(fileUrl);
    const text = await extractText(buffer, fileUrl);
    return text.trim() || null;
  } catch (err) {
    console.warn("[file-extract] Failed to extract text from", fileUrl, err);
    return null;
  }
}
