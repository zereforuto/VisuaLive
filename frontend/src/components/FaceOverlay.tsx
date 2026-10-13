import { useEffect, useRef } from "react";
import type { FaceResult } from "../hooks/useRecognitionStream";

interface Props {
  faces: FaceResult[];
  videoRef: React.RefObject<HTMLVideoElement>;
}

/**
 * Canvas overlay that draws:
 *   1. A "focus zone" — a glowing center rectangle that tells the user where
 *      to position their face for recognition.
 *   2. Face bounding boxes: full-color + label for faces inside the zone,
 *      dimmed outline only for faces outside it.
 *
 * The video uses `object-cover`, so we compute the letterbox / crop offset
 * to keep everything precisely aligned with what is visible.
 */

// Focus zone as a fraction of the rendered canvas size
const ZONE_W = 0.58;  // 58% of canvas width
const ZONE_H = 0.72;  // 72% of canvas height

function isFaceInZone(
  cx: number, cy: number,
  zx: number, zy: number, zw: number, zh: number
): boolean {
  return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
}

export default function FaceOverlay({ faces, videoRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const facesRef = useRef<FaceResult[]>(faces);
  useEffect(() => {
    facesRef.current = faces;
  }, [faces]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const video = videoRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const cssW = rect.width;
      const cssH = rect.height;
      const physW = Math.round(cssW * dpr);
      const physH = Math.round(cssH * dpr);

      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW;
        canvas.height = physH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // ── Focus zone geometry ──────────────────────────────────────────────
      const zw = cssW * ZONE_W;
      const zh = cssH * ZONE_H;
      const zx = (cssW - zw) / 2;
      const zy = (cssH - zh) / 2;
      const cornerLen = Math.min(zw, zh) * 0.09; // length of each corner bracket arm
      const r = 10; // corner radius of zone box

      // Dark vignette outside the zone
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      // Top strip
      ctx.fillRect(0, 0, cssW, zy);
      // Bottom strip
      ctx.fillRect(0, zy + zh, cssW, cssH - zy - zh);
      // Left strip (between top/bottom)
      ctx.fillRect(0, zy, zx, zh);
      // Right strip (between top/bottom)
      ctx.fillRect(zx + zw, zy, cssW - zx - zw, zh);
      ctx.restore();

      // Zone border (subtle)
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      roundRect(ctx, zx, zy, zw, zh, r);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Glowing corner brackets
      const corners: [number, number, number, number][] = [
        [zx,      zy,       1,  1],   // top-left
        [zx + zw, zy,      -1,  1],   // top-right
        [zx,      zy + zh,  1, -1],   // bottom-left
        [zx + zw, zy + zh, -1, -1],   // bottom-right
      ];
      ctx.save();
      ctx.strokeStyle = "rgba(99,179,237,0.90)";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(99,179,237,0.7)";
      ctx.shadowBlur = 10;
      for (const [cx, cy, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * cornerLen, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + dy * cornerLen);
        ctx.stroke();
      }
      ctx.restore();

      // "FOCUS ZONE" label at the bottom-center of the zone
      ctx.save();
      ctx.font = "600 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(99,179,237,0.70)";
      ctx.shadowColor = "rgba(99,179,237,0.5)";
      ctx.shadowBlur = 6;
      ctx.fillText("RECOGNITION ZONE", zx + zw / 2, zy + zh - 12);
      ctx.restore();

      // ── Face boxes ──────────────────────────────────────────────────────
      const currentFaces = facesRef.current;
      if (!video || video.videoWidth === 0 || currentFaces.length === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const coverScale = Math.max(cssW / vw, cssH / vh);
      const offsetX = (cssW - vw * coverScale) / 2;
      const offsetY = (cssH - vh * coverScale) / 2;

      for (const f of currentFaces) {
        const [x1, y1, x2, y2] = f.bbox;

        const rx = x1 * coverScale + offsetX;
        const ry = y1 * coverScale + offsetY;
        const rw = (x2 - x1) * coverScale;
        const rh = (y2 - y1) * coverScale;

        // Face center point
        const fcx = rx + rw / 2;
        const fcy = ry + rh / 2;
        const inZone = isFaceInZone(fcx, fcy, zx, zy, zw, zh);

        if (inZone) {
          // ── Full recognition box ──
          const color = f.is_recognized ? "#2fd889" : "#ff5470";
          const label = f.is_recognized
            ? `${f.person_name}  ${(f.similarity * 100).toFixed(0)}%`
            : `UNKNOWN  ${(f.similarity * 100).toFixed(0)}%`;

          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
          roundRect(ctx, rx, ry, rw, rh, 6);
          ctx.stroke();
          ctx.restore();

          // Label pill
          const labelH = 22;
          const labelW = Math.max(rw, 130);
          const labelY = ry > labelH + 4 ? ry - labelH - 3 : ry + rh + 3;

          ctx.save();
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.92;
          roundRect(ctx, rx, labelY, labelW, labelH, 4);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.fillStyle = "#0a0d14";
          ctx.font = "700 11px 'Inter', system-ui, sans-serif";
          ctx.textBaseline = "middle";
          ctx.shadowBlur = 0;
          ctx.fillText(label, rx + 7, labelY + labelH / 2);
          ctx.restore();
        } else {
          // ── Dimmed out-of-zone box (detected but not the focus) ──
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.shadowBlur = 0;
          roundRect(ctx, rx, ry, rw, rh, 6);
          ctx.stroke();
          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/** Draws a rounded rectangle path without stroking/filling it. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

