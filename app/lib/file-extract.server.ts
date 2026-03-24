import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

/** Download a file from a public URL and return it as a Buffer. */
export async function fetchFileBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract plain text from a file buffer.
 * Supports DOCX (via mammoth), PDF (via pdf-parse v2), and plain text files.
 */
export async function extractText(buffer: Buffer, url: string): Promise<string> {
  // Strip query params and hash before checking extension
  const pathname = url.split("?")[0].split("#")[0].toLowerCase();

  if (pathname.endsWith(".docx")) {
    const rawResult = await mammoth.extractRawText({ buffer });
    if (rawResult.value.trim()) return rawResult.value;
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const plainText = htmlResult.value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plainText;
  }

  if (pathname.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  return buffer.toString("utf-8");
}

/**
 * Downloads and extracts text from a file URL. Returns the extracted text
 * or null if the file couldn't be processed.
 */
export async function extractTextFromUrl(fileUrl: string): Promise<string | null> {
  try {
    console.log("[file-extract] Downloading file:", fileUrl);
    const buffer = await fetchFileBuffer(fileUrl);
    console.log(`[file-extract] Downloaded ${buffer.length} bytes from ${fileUrl}`);
    const text = await extractText(buffer, fileUrl);
    console.log(`[file-extract] Extracted ${text.length} chars from ${fileUrl}`);
    return text.trim() || null;
  } catch (err) {
    console.error("[file-extract] Failed to extract text from", fileUrl, err);
    return null;
  }
}
