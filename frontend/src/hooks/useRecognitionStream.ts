import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "../services/api";

export interface FaceResult {
  track_id: number;
  bbox: [number, number, number, number];
  person_id: number | null;
  person_name: string | null;
  similarity: number;
  is_recognized: boolean;
}

export interface StreamStats {
  fps: number;
  detection_ms: number;
  recognition_ms: number;
  total_ms: number;
  faces_detected: number;
  recognized_count: number;
  unknown_count: number;
  device: string;
  gpu_name: string | null;
}

/**
 * Frame send strategy: ack-driven loop.
 *
 * Instead of a fixed setInterval (which queues frames while the server is busy
 * and creates a growing pipeline of latency), we send the next frame
 * immediately after receiving the server's response for the previous one.
 * This keeps exactly ONE frame in-flight at all times — zero queue, minimum
 * round-trip delay.
 *
 * SEND_WIDTH controls the width frames are downscaled to before encoding.
 * Smaller = less encode time and network bytes. 320px is enough for
 * InsightFace's SCRFD detector and cuts encode time roughly in half vs 400px.
 */
const SEND_WIDTH = 320;

export function useRecognitionStream(videoRef: React.RefObject<HTMLVideoElement>) {
  const [faces, setFaces] = useState<FaceResult[]>([]);
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const streamRef = useRef<MediaStream | null>(null);

  // Ack-driven send loop refs
  const sendingRef = useRef(false);   // true while a frame is in-flight
  const pausedRef = useRef(false);    // mirrors paused state for the WS callback

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  /**
   * Capture and send one frame. Called immediately after WS ack (onmessage)
   * so there is always at most one frame in-flight.
   */
  const sendFrame = useCallback(() => {
    const video = videoRef.current;
    const ws = wsRef.current;
    if (
      !video ||
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      video.videoWidth === 0 ||
      pausedRef.current ||
      sendingRef.current
    ) return;

    const canvas = offscreenRef.current;
    const scale = SEND_WIDTH / video.videoWidth;
    const h = Math.round(video.videoHeight * scale);

    if (canvas.width !== SEND_WIDTH || canvas.height !== h) {
      canvas.width = SEND_WIDTH;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, SEND_WIDTH, h);

    sendingRef.current = true;
    // imageBitmap → toBlob path is faster in Chromium than drawImage on every
    // frame because it avoids the intermediate composite step.
    canvas.toBlob(
      (blob) => {
        if (blob && ws.readyState === WebSocket.OPEN) {
          ws.send(blob); // send Blob directly — no need for arrayBuffer() hop
        } else {
          sendingRef.current = false; // unblock if we couldn't send
        }
      },
      "image/jpeg",
      0.60   // slightly lower quality = ~30% smaller payload, negligible visual diff
    );
  }, [videoRef]);

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "blob";

    ws.onopen = () => {
      sendingRef.current = false;
      sendFrame(); // kick off the first frame as soon as the socket is ready
    };

    ws.onmessage = (event) => {
      // Mark the in-flight frame as done before parsing so the next sendFrame
      // call happens as fast as possible.
      sendingRef.current = false;

      const payload = JSON.parse(event.data as string);
      const video = videoRef.current;

      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const scaleBack = video.videoWidth / SEND_WIDTH;
        const scaledFaces = (payload.faces || []).map((f: FaceResult) => ({
          ...f,
          bbox: [
            f.bbox[0] * scaleBack,
            f.bbox[1] * scaleBack,
            f.bbox[2] * scaleBack,
            f.bbox[3] * scaleBack,
          ] as [number, number, number, number],
        }));
        setFaces(scaledFaces);
      } else {
        setFaces(payload.faces || []);
      }
      setStats(payload.stats);

      // Immediately send the next frame (ack-driven loop)
      if (!pausedRef.current) sendFrame();
    };

    ws.onerror = () => setError("WebSocket connection error — is the backend running?");
    ws.onclose = () => { sendingRef.current = false; };
    wsRef.current = ws;
  }, [videoRef, sendFrame]);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { width: 1280, height: 720, frameRate: { ideal: 30 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        connectWebSocket();
        setCameraOn(true);
      } catch (e: any) {
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access in your browser settings."
            : `Camera unavailable: ${e?.message ?? e}`
        );
      }
    },
    [connectWebSocket, videoRef]
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    sendingRef.current = false;
    setCameraOn(false);
    setFaces([]);
    setStats(null);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  return { faces, stats, cameraOn, paused, error, startCamera, stopCamera, setPaused };
}
