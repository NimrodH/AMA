/**
 * Google Docs server-side utilities.
 *
 * Extracts the document ID from various Google Docs URL formats and exports the
 * document as a PDF buffer using the public export endpoint.
 *
 * NOTE: Only publicly-shared documents ("Anyone with the link can view") are
 * supported. Private documents require OAuth and will return a 401/403.
 */

const GDOC_PATTERN =
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/;

const MIME_TYPE_EXPORTS: Record<string, { format: string; ext: string; mimeType: string }> = {
  document: { format: "pdf", ext: "pdf", mimeType: "application/pdf" },
  presentation: { format: "pdf", ext: "pdf", mimeType: "application/pdf" },
  spreadsheets: { format: "pdf", ext: "pdf", mimeType: "application/pdf" },
};

/**
 * Parses a Google Docs/Slides/Sheets URL and returns the document ID.
 * Returns null if the URL is not a recognizable Google Docs URL.
 */
export function parseGoogleDocId(url: string): string | null {
  const match = url.match(GDOC_PATTERN);
  return match ? match[1] : null;
}

/**
 * Returns true if the URL looks like a Google Docs document link.
 */
export function isGoogleDocsUrl(url: string): boolean {
  return GDOC_PATTERN.test(url);
}

/**
 * Fetches a Google Docs document and returns it as a PDF buffer.
 *
 * @throws Error with a user-friendly Hebrew message if:
 *   - URL is not a valid Google Docs URL
 *   - Document is not publicly accessible (403/401)
 *   - Any network or export error occurs
 */
export async function fetchGoogleDocAsPdf(
  rawUrl: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const docId = parseGoogleDocId(rawUrl);
  if (!docId) {
    throw new Error("כתובת URL לא תקינה של Google Docs");
  }

  // Determine document type from URL (default: document)
  let format = "pdf";
  let mimeType = "application/pdf";

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=${format}`;

  let response: Response;
  try {
    response = await fetch(exportUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StudyApp/1.0)",
      },
    });
  } catch (err) {
    throw new Error("לא ניתן לגשת למסמך — בדוק את חיבור האינטרנט");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "המסמך אינו נגיש — ודא שהמסמך שיתופי לכל מי שיש לו קישור (Anyone with the link can view)"
    );
  }

  if (response.status === 404) {
    throw new Error("המסמך לא נמצא — בדוק שהכתובת נכונה");
  }

  if (!response.ok) {
    throw new Error(`שגיאה בייצוא המסמך (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength === 0) {
    throw new Error("המסמך ריק או לא ניתן לייצאו");
  }

  const fileName = `google-doc-${docId}.pdf`;

  return { buffer, fileName, mimeType };
}
