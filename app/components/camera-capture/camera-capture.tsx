import * as React from "react";
import { Camera, RotateCcw, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "~/components/ui/button/button";
import styles from "./camera-capture.module.css";

interface CameraCaptureProps {
  /** Called when the user confirms a capture. Receives the image as a File. */
  onCapture: (file: File) => void;
}

type CameraStep = "idle" | "streaming" | "captured" | "transcribing" | "done" | "error";

/**
 * CameraCapture — live camera preview, single-shot capture,
 * and optional GPT-4o Vision Hebrew transcription.
 *
 * Architecture:
 * - Uses `navigator.mediaDevices.getUserMedia` for the video stream.
 * - Draws the captured frame onto a hidden <canvas>, converts to Blob.
 * - POSTs base64-encoded image to `/api/transcribe-image` for GPT-4o Vision OCR.
 * - Returns the result as a `.txt` File so it slots into the existing upload pipeline.
 * - If transcription is skipped, returns the raw JPEG image file instead.
 * - Always stops the media stream on unmount to release the camera.
 */
export function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [step, setStep] = React.useState<CameraStep>("idle");
  const [capturedDataUrl, setCapturedDataUrl] = React.useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = React.useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string>("");
  const [transcribedText, setTranscribedText] = React.useState<string>("");

  // ── Start camera ──────────────────────────────────────────────────────────

  const startCamera = React.useCallback(async () => {
    setStep("streaming");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "לא ניתן לגשת למצלמה";
      setErrorMsg(msg);
      setStep("error");
    }
  }, []);

  // ── Stop stream on unmount ─────────────────────────────────────────────────

  React.useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Capture frame ─────────────────────────────────────────────────────────

  const capture = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedDataUrl(canvas.toDataURL("image/jpeg", 0.92));
        // Stop the live stream — we have the frame
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStep("captured");
      },
      "image/jpeg",
      0.92
    );
  }, []);

  // ── Retake ────────────────────────────────────────────────────────────────

  const retake = React.useCallback(() => {
    setCapturedDataUrl(null);
    setCapturedBlob(null);
    setTranscribedText("");
    startCamera();
  }, [startCamera]);

  // ── Transcribe via GPT-4o Vision ──────────────────────────────────────────

  const transcribe = React.useCallback(async () => {
    if (!capturedDataUrl || !capturedBlob) return;
    setStep("transcribing");

    try {
      // Convert data URL to base64 string (strip the `data:...;base64,` prefix)
      const base64 = capturedDataUrl.split(",")[1];

      const res = await fetch("/api/transcribe-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg" }),
      });

      const data = (await res.json()) as { ok: boolean; text?: string; error?: string };

      if (!data.ok || !data.text) {
        throw new Error(data.error ?? "שגיאה בתמלול");
      }

      setTranscribedText(data.text);
      setStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [capturedDataUrl, capturedBlob]);

  // ── Confirm — upload transcribed text as .txt ──────────────────────────────

  const confirmTranscribed = React.useCallback(() => {
    if (!transcribedText) return;
    const blob = new Blob([transcribedText], { type: "text/plain" });
    const file = new File([blob], `צילום-${Date.now()}.txt`, { type: "text/plain" });
    onCapture(file);
  }, [transcribedText, onCapture]);

  // ── Skip transcription — upload raw JPEG ──────────────────────────────────

  const confirmRawImage = React.useCallback(() => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `צילום-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
  }, [capturedBlob, onCapture]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* Hidden canvas used for frame extraction */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* ── IDLE: start prompt ── */}
      {step === "idle" && (
        <div className={styles.idle}>
          <Camera className={styles.idleIcon} />
          <p className={styles.idleText}>צלם מסמך, הרצאה או דף כתוב יד</p>
          <Button type="button" onClick={startCamera}>
            <Camera style={{ width: 16, height: 16, marginLeft: "var(--space-2)" }} />
            הפעל מצלמה
          </Button>
        </div>
      )}

      {/* ── STREAMING: live preview + capture button ── */}
      {step === "streaming" && (
        <div className={styles.previewWrapper}>
          <video ref={videoRef} className={styles.video} playsInline muted />
          <Button type="button" className={styles.captureBtn} onClick={capture}>
            <Camera style={{ width: 18, height: 18, marginLeft: "var(--space-2)" }} />
            צלם
          </Button>
        </div>
      )}

      {/* ── CAPTURED: preview + action choices ── */}
      {(step === "captured" || step === "transcribing") && capturedDataUrl && (
        <div className={styles.capturedWrapper}>
          <img src={capturedDataUrl} alt="תצוגה מקדימה של הצילום" className={styles.preview} />
          <div className={styles.capturedActions}>
            <Button type="button" variant="outline" onClick={retake} disabled={step === "transcribing"}>
              <RotateCcw style={{ width: 15, height: 15, marginLeft: "var(--space-2)" }} />
              צלם מחדש
            </Button>
            <Button type="button" variant="outline" onClick={confirmRawImage} disabled={step === "transcribing"}>
              <Check style={{ width: 15, height: 15, marginLeft: "var(--space-2)" }} />
              העלה כתמונה
            </Button>
            <Button type="button" onClick={transcribe} disabled={step === "transcribing"}>
              {step === "transcribing" ? (
                <>
                  <Loader2 className={styles.spinner} />
                  מתמלל...
                </>
              ) : (
                <>✨ תמלל טקסט (GPT-4o)</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── DONE: transcription result ── */}
      {step === "done" && (
        <div className={styles.resultWrapper}>
          <p className={styles.resultLabel}>תוצאת התמלול — ניתן לערוך לפני העלאה:</p>
          <textarea
            className={styles.resultTextarea}
            value={transcribedText}
            onChange={(e) => setTranscribedText(e.target.value)}
            dir="auto"
            rows={10}
          />
          <div className={styles.resultActions}>
            <Button type="button" variant="outline" onClick={retake}>
              <RotateCcw style={{ width: 15, height: 15, marginLeft: "var(--space-2)" }} />
              צלם מחדש
            </Button>
            <Button type="button" onClick={confirmTranscribed}>
              <Check style={{ width: 15, height: 15, marginLeft: "var(--space-2)" }} />
              אשר והעלה כטקסט
            </Button>
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {step === "error" && (
        <div className={styles.errorWrapper}>
          <AlertCircle className={styles.errorIcon} />
          <p className={styles.errorText}>{errorMsg}</p>
          <Button type="button" variant="outline" onClick={() => setStep("idle")}>
            נסה שוב
          </Button>
        </div>
      )}
    </div>
  );
}
