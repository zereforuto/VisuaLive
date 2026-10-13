import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRecognitionStream } from "../hooks/useRecognitionStream";
import { SystemAPI } from "../services/api";
import FaceOverlay from "../components/FaceOverlay";

export default function LiveRecognition() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { faces, stats, cameraOn, paused, error, startCamera, stopCamera, setPaused } =
    useRecognitionStream(videoRef);
  const [threshold, setThreshold] = useState(0.45);


  const applyThreshold = async (value: number) => {
    setThreshold(value);
    await SystemAPI.setThreshold(value);
  };

  return (
    <div className="page-shell">
      <h2 className="text-2xl font-semibold text-white mb-1">Live Recognition</h2>
      <p className="text-white/50 text-sm mb-6">Real-time face detection and identity matching</p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="interactive-panel relative aspect-video overflow-hidden rounded-xl border border-border bg-black shadow-2xl shadow-black/20">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <FaceOverlay faces={faces} videoRef={videoRef} />

            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
                Camera is off
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-5">
            {!cameraOn ? (
              <button
                onClick={() => startCamera()}
                className="group relative flex items-center gap-3 rounded-2xl border border-red-500/50 bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_28px_rgba(239,68,68,0.45)] transition-all duration-300 ease-out hover:from-red-500 hover:to-rose-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.7)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <span className="relative flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-white"></span>
                </span>
                <span>Start Camera</span>
                <svg
                  className="h-4 w-4 text-white/80 transition-transform duration-300 ease-out group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex items-center gap-2.5 rounded-2xl border border-red-500/40 bg-red-950/40 px-6 py-3.5 text-sm font-bold text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.25)] transition-all duration-300 ease-out hover:bg-red-900/60 hover:text-white hover:shadow-[0_0_30px_rgba(239,68,68,0.45)] cursor-pointer"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
                <span>Stop Camera</span>
              </button>
            )}

            {cameraOn && (
              <button
                onClick={() => setPaused(!paused)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm font-semibold text-white/80 transition-all duration-300 ease-out hover:border-white/20 hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                {paused ? "▶ Resume Stream" : "⏸ Pause Stream"}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Live Stats Panel */}
          <div className="interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                Live Stats
              </h3>
              <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Realtime</span>
            </div>

            <dl className="space-y-2.5 text-xs font-mono">
              <Stat label="FPS" value={stats?.fps ?? "—"} />
              <Stat label="Faces" value={stats?.faces_detected ?? 0} />
              <Stat label="Recognized" value={stats?.recognized_count ?? 0} tone="success" />
              <Stat label="Unknown" value={stats?.unknown_count ?? 0} tone="danger" />
              <Stat label="Detection" value={stats ? `${stats.detection_ms}ms` : "—"} />
              <Stat label="Recognition" value={stats ? `${stats.recognition_ms}ms` : "—"} />
              <Stat label="Total Latency" value={stats ? `${stats.total_ms}ms` : "—"} />
              <Stat label="Device" value={stats?.device ?? "—"} />
              {stats?.gpu_name && <Stat label="GPU" value={stats.gpu_name} />}
            </dl>
          </div>

          {/* Recognition Sensitivity Panel */}
          <div className="interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                Recognition Sensitivity
              </h3>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-mono font-bold text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]">
                {threshold.toFixed(2)}
              </span>
            </div>

            <p className="text-[11px] text-white/40 mb-4 leading-relaxed">
              Cosine similarity cutoff for matching unknown faces against registered vector embeddings.
            </p>

            <div className="relative py-2">
              <input
                type="range"
                min={0.2}
                max={0.8}
                step={0.01}
                value={threshold}
                onChange={(e) => applyThreshold(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg bg-black/60 border border-white/10 appearance-none cursor-pointer accent-blue-500 transition-all focus:outline-none"
              />
            </div>

            <div className="flex justify-between text-[11px] font-mono text-white/40 mt-1">
              <span className="flex items-center gap-1">
                <span className="text-white/20">◀</span> Lenient (0.20)
              </span>
              <span className="flex items-center gap-1">
                Strict (0.80) <span className="text-white/20">▶</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-white";
  return (
    <div className="flex justify-between">
      <dt className="text-white/40">{label}</dt>
      <dd className={color}>{value}</dd>
    </div>
  );
}
