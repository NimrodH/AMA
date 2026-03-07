import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ArrowRight, ArrowLeft, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "~/components/ui/button/button";
import styles from "./pdf-viewer.module.css";

// Configure PDF.js worker via CDN so it runs off-thread
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.0;

interface PdfViewerProps {
  fileUrl: string;
  topic: string;
}

export default function PdfViewer({ fileUrl, topic }: PdfViewerProps) {
  const [numPages, setNumPages] = React.useState<number>(0);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [scale, setScale] = React.useState(DEFAULT_SCALE);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const handleDocumentLoadError = (error: Error) => {
    console.error("PDF load error:", error);
    setLoadError("לא ניתן לטעון את המסמך. ייתכן שהקובץ אינו תקין.");
    setIsLoading(false);
  };

  const goToPrevPage = () => setPageNumber((p) => Math.max(1, p - 1));
  const goToNextPage = () => setPageNumber((p) => Math.min(numPages, p + 1));

  const zoomIn = () =>
    setScale((s) => Math.min(MAX_SCALE, parseFloat((s + SCALE_STEP).toFixed(2))));
  const zoomOut = () =>
    setScale((s) => Math.max(MIN_SCALE, parseFloat((s - SCALE_STEP).toFixed(2))));
  const resetZoom = () => setScale(DEFAULT_SCALE);

  const handleKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goToPrevPage();
      if (e.key === "ArrowLeft") goToNextPage();
    },
    [numPages] // eslint-disable-line
  );

  React.useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loadError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>{loadError}</p>
        <Button asChild variant="outline">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            פתח בחלון חדש
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.viewer}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarSection}>
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            aria-label="עמוד קודם"
          >
            <ArrowRight style={{ width: 16, height: 16 }} />
          </Button>
          <span className={styles.pageIndicator} aria-live="polite">
            {isLoading ? "טוען..." : `${pageNumber} / ${numPages}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            aria-label="עמוד הבא"
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
          </Button>
        </div>

        <span className={styles.toolbarTitle}>{topic}</span>

        <div className={styles.toolbarSection}>
          <Button
            variant="outline"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            aria-label="הקטן תצוגה"
          >
            <ZoomOut style={{ width: 16, height: 16 }} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={resetZoom}
            className={styles.zoomLabel}
            aria-label="אפס זום"
          >
            {Math.round(scale * 100)}%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            aria-label="הגדל תצוגה"
          >
            <ZoomIn style={{ width: 16, height: 16 }} />
          </Button>
        </div>
      </div>

      {/* ── PDF canvas area ── */}
      <div className={styles.canvasArea}>
        {isLoading && (
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} aria-hidden="true" />
            <p className={styles.loadingText}>טוען מסמך...</p>
          </div>
        )}
        <Document
          file={fileUrl}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={null}
          className={styles.document}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            className={styles.page}
            loading={null}
            renderAnnotationLayer
            renderTextLayer
          />
        </Document>
      </div>

      {/* ── Bottom nav (keyboard hint) ── */}
      <div className={styles.bottomBar}>
        <span className={styles.hint}>טיפ: השתמש בחצי המקלדת לניווט בין עמודים</span>
        <div className={styles.toolbarSection}>
          <Button variant="secondary" size="sm" onClick={goToPrevPage} disabled={pageNumber <= 1}>
            <ArrowRight style={{ width: 14, height: 14, marginLeft: 4 }} />
            קודם
          </Button>
          <Button variant="secondary" size="sm" onClick={goToNextPage} disabled={pageNumber >= numPages}>
            הבא
            <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
          </Button>
        </div>
      </div>
    </div>
  );
}
