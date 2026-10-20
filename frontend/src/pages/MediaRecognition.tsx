import { useEffect, useRef, useState } from "react";
import { RecognitionAPI, type MediaRecognitionResult } from "../services/api";

type SourceMode = "upload" | "camera";

export default function MediaRecognition() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<MediaRecognitionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Camera capture states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Manage object URL for file preview
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Clean up camera on unmount or when camera turns off
  const stopCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* no-op */
      }
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsRecording(false);
    setRecordSeconds(0);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in your browser."
          : `Could not access camera: ${err?.message ?? err}`
      );
      setCameraActive(false);
    }
  };

  const switchMode = (mode: SourceMode) => {
    setSourceMode(mode);
    setError(null);
    if (mode === "upload") {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const chooseFile = (next: File | null) => {
    setFile(next);
    setResult(null);
    setError(null);
  };

  const runAnalysis = async (fileToAnalyze: File) => {
    setRunning(true);
    setError(null);
    try {
      const res = await RecognitionAPI.recognizeMedia(fileToAnalyze);
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Could not analyze this media.");
    } finally {
      setRunning(false);
    }
  };

  const analyze = () => {
    if (file) {
      runAnalysis(file);
    }
  };

  // Capture single high-res photo from camera stream
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraActive) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const capturedFile = new File([blob], `capture-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        setFile(capturedFile);
        stopCamera();
        setSourceMode("upload"); // switch back to preview & results view
        await runAnalysis(capturedFile);
      },
      "image/jpeg",
      0.92
    );
  };

  // Record short video clip from camera stream
  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || !cameraActive) return;

    recordedChunksRef.current = [];
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

    try {
      const recorder = new MediaRecorder(stream, { mimeType: supportedMime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setIsRecording(false);
        setRecordSeconds(0);

        const ext = supportedMime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: supportedMime });
        if (blob.size === 0) return;

        const recordedFile = new File([blob], `recording-${Date.now()}.${ext}`, {
          type: supportedMime,
        });

        setFile(recordedFile);
        stopCamera();
        setSourceMode("upload"); // switch back to show preview & instant analysis
        await runAnalysis(recordedFile);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);

      const startTimestamp = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        setRecordSeconds(elapsed);
        // Automatic cap at 15 seconds to keep analysis fast and responsive
        if (elapsed >= 15) {
          recorder.stop();
        }
      }, 500);
    } catch (err: any) {
      setError(`Video recording not supported: ${err?.message ?? err}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const isVideo =
    file?.type.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(file?.name ?? "");

  return (
    <div className="page-shell">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-1">Media Recognition</h2>
          <p className="text-white/50 text-sm">
            Match faces in photos or videos against your enrolled people.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => switchMode("upload")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
              sourceMode === "upload"
                ? "bg-white text-black shadow-md font-bold"
                : "text-white/60 hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Upload File
          </button>
          <button
            type="button"
            onClick={() => switchMode("camera")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
              sourceMode === "camera"
                ? "bg-white text-black shadow-md font-bold"
                : "text-white/60 hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Live Camera / Record
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl">
          {sourceMode === "upload" ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-white" htmlFor="recognition-media">
                  Select a photo or video
                </label>
                {file && (
                  <button
                    type="button"
                    onClick={() => chooseFile(null)}
                    className="text-xs text-white/40 hover:text-white transition-colors"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              <div className="relative group">
                <input
                  id="recognition-media"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-white/60 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-white/[0.08] file:text-white hover:file:bg-white/[0.14] file:cursor-pointer file:transition-all"
                />
              </div>

              <p className="mt-3 text-xs text-white/40">
                Supported: JPG, PNG, WEBP, MP4, MOV, WEBM. Videos are sampled once per second (up to 120 frames).
              </p>

              {previewUrl && (
                <div className="mt-6 aspect-video overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center relative shadow-inner">
                  {isVideo ? (
                    <video src={previewUrl} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={previewUrl} alt="Selected upload" className="w-full h-full object-contain" />
                  )}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-mono text-white/80">
                    {isVideo ? "Video Clip" : "Photo"}
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-6">
                <button
                  disabled={!file || running}
                  onClick={analyze}
                  className="btn-primary rounded-xl px-5 py-3 text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {running ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      <span>Analyzing media…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>Recognize Faces</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode("camera")}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Or Capture with Camera</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Camera Capture View */}
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-white flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      cameraActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                    }`}
                  />
                  Live Camera View
                </label>
                {cameraActive && (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    Turn Camera Off
                  </button>
                )}
              </div>

              <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    cameraActive ? "opacity-100" : "opacity-0"
                  }`}
                />

                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center mb-3 text-white/50">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-white/60 mb-4">Camera is currently stopped or unavailable</p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="btn-primary rounded-xl px-5 py-2.5 text-xs font-bold"
                    >
                      Start Camera
                    </button>
                  </div>
                )}

                {/* Recording Status Overlay */}
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-red-950/80 border border-red-500/50 backdrop-blur-md shadow-lg">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                    <span className="text-xs font-mono font-bold text-white tracking-wider">
                      REC 00:{recordSeconds < 10 ? `0${recordSeconds}` : recordSeconds} / 00:15
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons for Snapshot & Recording */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <button
                  type="button"
                  disabled={!cameraActive || isRecording || running}
                  onClick={capturePhoto}
                  className="group relative flex items-center gap-2.5 rounded-xl border border-sky-400/50 bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-all duration-300 hover:from-sky-500 hover:to-blue-500 hover:shadow-[0_0_30px_rgba(56,189,248,0.55)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Snap Photo & Recognize</span>
                </button>

                {!isRecording ? (
                  <button
                    type="button"
                    disabled={!cameraActive || running}
                    onClick={startRecording}
                    className="flex items-center gap-2.5 rounded-xl border border-rose-500/50 bg-rose-950/40 px-5 py-3 text-sm font-bold text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.25)] transition-all duration-300 hover:bg-rose-900/60 hover:text-white hover:shadow-[0_0_30px_rgba(244,63,94,0.45)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    <span>Record Video Clip</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center gap-2.5 rounded-xl border border-rose-500 bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_25px_rgba(244,63,94,0.6)] animate-pulse transition-all cursor-pointer"
                  >
                    <span className="h-2.5 w-2.5 rounded-sm bg-white" />
                    <span>Stop & Recognize ({15 - recordSeconds}s max)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => switchMode("upload")}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white transition-all ml-auto cursor-pointer"
                >
                  Back to File Upload
                </button>
              </div>
            </>
          )}
        </section>

        {/* Results Panel */}
        <aside className="interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-wide">Analysis Results</h3>
              {result && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/10 text-white/80">
                  {result.media_type}
                </span>
              )}
            </div>

            {running && (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
                <p className="text-sm font-medium text-white/80">Running face recognition…</p>
                <p className="text-xs text-white/40 mt-1">Extracting embeddings & comparing database</p>
              </div>
            )}

            {!running && !result && (
              <div className="py-12 text-center text-white/40 text-sm">
                <div className="w-10 h-10 rounded-full bg-white/[0.04] mx-auto flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                Upload media or snap a photo/video using your camera to see detected and recognized faces.
              </div>
            )}

            {!running && result && (
              <>
                <dl className="space-y-3 text-sm">
                  <Row label="Frames analyzed" value={result.frames_analyzed} />
                  <Row label="Faces detected" value={result.faces_detected} />
                  <Row label="Recognized" value={result.recognized_faces} tone="text-success font-semibold" />
                  <Row label="Unknown" value={result.unknown_faces} tone="text-danger font-semibold" />
                  <Row label="Processing time" value={`${result.processing_ms}ms`} />
                  {result.duration_seconds !== null && (
                    <Row label="Video duration" value={`${result.duration_seconds}s`} />
                  )}
                </dl>

                <div className="mt-6 border-t border-white/10 pt-4">
                  <p className="text-xs uppercase tracking-wider text-white/40 mb-3">Recognized people</p>
                  {result.recognized_people.length === 0 ? (
                    <p className="text-sm text-white/40 italic">No enrolled people matched.</p>
                  ) : (
                    <ul className="space-y-2">
                      {result.recognized_people.map((person) => (
                        <li
                          key={person.name}
                          className="flex justify-between items-center text-sm px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]"
                        >
                          <span className="text-white font-medium">{person.name}</span>
                          <span className="text-emerald-400 font-mono text-xs bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {person.appearances} {person.appearances === 1 ? "match" : "matches"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Frame breakdown if available */}
      {result && (
        <section className="interactive-panel mt-6 rounded-2xl border border-white/[0.08] p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Sampled-frame details</h3>
          <div className="max-h-80 overflow-auto space-y-2 pr-2">
            {result.frame_results
              .filter((entry) => entry.faces.length > 0)
              .map((entry) => (
                <div
                  key={entry.frame}
                  className="rounded-lg bg-black/25 border border-white/[0.04] px-4 py-3 text-sm flex items-center justify-between"
                >
                  <span className="font-mono text-white/45 text-xs">
                    {result.media_type === "video" ? `Frame @ ${entry.time_seconds}s` : "Snapshot"}
                  </span>
                  <span className="text-white/80 text-xs">
                    {entry.faces
                      .map((face) =>
                        face.is_recognized
                          ? `${face.person_name} (${Math.round(face.similarity * 100)}%)`
                          : "Unknown Face"
                      )
                      .join(", ")}
                  </span>
                </div>
              ))}
            {result.faces_detected === 0 && (
              <p className="text-sm text-white/40">No faces were detected in the analyzed media.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex justify-between items-center gap-3 py-0.5">
      <dt className="text-white/45 text-xs">{label}</dt>
      <dd className={`text-sm font-mono ${tone}`}>{value}</dd>
    </div>
  );
}
