import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import StatCard from "../components/StatCard";
import { SystemAPI, PersonsAPI, SystemStatus, Person } from "../services/api";

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [s, p] = await Promise.all([SystemAPI.status(), PersonsAPI.list()]);
        setStatus(s);
        setPeople(p);
        setError(null);
      } catch (e) {
        setError("Could not reach backend at localhost:8000. Is it running?");
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredPeople = people.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.identifier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="page-shell">
      {/* Title with glow */}
      <div className="hero-depth mb-10 pt-4 text-center sm:pt-6">
        <h1 className="brand-glow text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
          VisuaLive
        </h1>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Primary action cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-4">
        {/* Live Recognition */}
        <Link
          to="/live"
          className="interactive-panel card-outline-red group flex min-h-[140px] items-center gap-5 rounded-2xl p-6 transition-all"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-950/30 shadow-[0_0_24px_rgba(239,68,68,0.2)]">
            {/* Outer static ring */}
            <span className="absolute h-9 w-9 rounded-full border border-red-500/20"></span>
            {/* Pulsing wave ring 1 */}
            <motion.span
              animate={{ scale: [0.75, 1.6], opacity: [0.9, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
              className="absolute h-8 w-8 rounded-full border-2 border-red-500/70"
            />
            {/* Pulsing wave ring 2 */}
            <motion.span
              animate={{ scale: [0.75, 1.6], opacity: [0.9, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: 0.9, ease: "easeOut" }}
              className="absolute h-8 w-8 rounded-full border-2 border-red-400/60"
            />
            {/* Inner pulsing glowing bullseye dot */}
            <motion.span
              animate={{ scale: [0.9, 1.15, 0.9] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-10 flex h-3.5 w-3.5 rounded-full bg-red-500 shadow-[0_0_14px_#ef4444]"
            />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide group-hover:text-red-300 transition-colors">
              Live Recognition
            </h2>
            <p className="mt-1 text-xs text-white/55 leading-relaxed">
              Start a camera session and identify faces in real time.
            </p>
          </div>
        </Link>

        {/* Media Recognition */}
        <Link
          to="/media"
          className="interactive-panel group flex min-h-[140px] items-center gap-5 rounded-2xl border border-white/30 bg-gradient-to-br from-white/[0.13] to-white/[0.035] p-6 shadow-[0_0_28px_rgba(255,255,255,0.10)] transition-all hover:border-white/55 hover:shadow-[0_0_36px_rgba(255,255,255,0.18)]"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/[0.10] shadow-[0_0_22px_rgba(255,255,255,0.15)]">
            <motion.span
              animate={{ x: [0, 4, 0], opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="text-3xl font-bold leading-none text-white [text-shadow:0_0_12px_rgba(255,255,255,0.85)]"
            >
              &gt;
            </motion.span>
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide text-white transition-colors group-hover:text-white">
              Media Recognition
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-white/65">
              Upload a photo or video and identify enrolled faces.
            </p>
          </div>
        </Link>

        {/* System Status */}
        <Link
          to="/system"
          className="interactive-panel card-outline-green group flex min-h-[140px] items-center gap-5 rounded-2xl p-6 transition-all"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/30 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
            {/* Rotating dashed ring */}
            <motion.svg
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              className="h-7 w-7 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeDasharray="3.5 3.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9.5" />
            </motion.svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide group-hover:text-emerald-300 transition-colors">
              System Status
            </h2>
            <p className="mt-1 text-xs text-white/55 leading-relaxed">
              Review GPU, AI provider, database, and recognition health.
            </p>
          </div>
        </Link>

        {/* Add a Person */}
        <Link
          to="/dataset"
          className="interactive-panel card-outline-blue group flex min-h-[140px] items-center gap-5 rounded-2xl p-6 transition-all"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-950/30 shadow-[0_0_24px_rgba(59,130,246,0.2)]">
            {/* Outer subtle ring */}
            <span className="absolute h-9 w-9 rounded-full border border-blue-500/20"></span>
            {/* Pulsing wave ring 1 */}
            <motion.span
              animate={{ scale: [0.75, 1.55], opacity: [0.8, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
              className="absolute h-8 w-8 rounded-full border-2 border-blue-500/60"
            />
            {/* Pulsing wave ring 2 */}
            <motion.span
              animate={{ scale: [0.75, 1.55], opacity: [0.8, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: 1.1, ease: "easeOut" }}
              className="absolute h-8 w-8 rounded-full border-2 border-cyan-400/50"
            />
            {/* Pulsing glowing plus icon */}
            <motion.span
              animate={{ scale: [0.92, 1.14, 0.92] }}
              transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-10 text-2xl font-light text-blue-400 [text-shadow:0_0_10px_rgba(59,130,246,0.8)]"
            >
              +
            </motion.span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide group-hover:text-blue-300 transition-colors">
              Add a Person
            </h2>
            <p className="mt-1 text-xs text-white/55 leading-relaxed">
              Build your local recognition dataset with reference media.
            </p>
          </div>
        </Link>
      </div>

      {/* 4 Detailed Stat Cards matching Google Stitch */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* REGISTERED PEOPLE */}
        <div className="interactive-panel flex flex-col justify-between rounded-2xl border border-white/[0.08] p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Registered People
                </span>
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04] text-xs text-white/40">
                👤
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-4xl font-extrabold text-white">
                {status?.known_people ?? people.length ?? 0}
              </span>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-400">
                SUBJECT ACTIVE
              </span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
            <span className="text-white/40">Capacity</span>
            <span className="font-mono text-white/80">
              {status?.known_people ?? people.length ?? 0}/10,000
            </span>
          </div>
        </div>

        {/* TOTAL EMBEDDINGS */}
        <div className="interactive-panel flex flex-col justify-between rounded-2xl border border-white/[0.08] p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400"></span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Total Embeddings
                </span>
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04] text-xs text-white/40">
                ⬡
              </div>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-4xl font-extrabold text-white">
                {status?.total_embeddings ?? "—"}
              </span>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-purple-400">
                512-DIM VECTOR
              </span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
            <span className="text-white/40">Index Type</span>
            <span className="font-medium text-white/80">Cosine Metric HNSW</span>
          </div>
        </div>

        {/* GPU ACCELERATION */}
        <div className="interactive-panel flex flex-col justify-between rounded-2xl border border-white/[0.08] p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  GPU Acceleration
                </span>
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-xs text-emerald-400 border border-emerald-500/20">
                🗲
              </div>
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-emerald-400 leading-snug line-clamp-2">
                {status?.gpu.gpu_name || (status?.gpu.gpu_detected ? "NVIDIA Dedicated GPU" : "CPU Processing")}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"
                    style={{ width: status?.gpu.cuda_available ? "24%" : "8%" }}
                  />
                </div>
                <span className="text-[10px] font-mono text-white/50 whitespace-nowrap">
                  {status?.gpu.cuda_available ? "24% VRAM" : "CPU RAM"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
            <span className="text-white/40">Engine</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              {status?.gpu.cuda_available ? "CUDA 12.4 Active" : status?.gpu.execution_provider || "CPU Mode"}
            </span>
          </div>
        </div>

        {/* DATABASE STATUS */}
        <div className="interactive-panel flex flex-col justify-between rounded-2xl border border-white/[0.08] p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    status?.database_connected ? "bg-emerald-400" : "bg-red-400"
                  }`}
                ></span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Database Status
                </span>
              </div>
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04] text-xs text-emerald-400/80">
                🖴
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2.5">
              <span
                className={`h-3 w-3 rounded-full ${
                  status?.database_connected
                    ? "bg-emerald-400 shadow-[0_0_12px_#34d399]"
                    : "bg-red-400 shadow-[0_0_12px_#ef4444]"
                }`}
              ></span>
              <span className="text-2xl font-bold text-emerald-400">
                {status?.database_connected ? "Connected" : "Offline"}
              </span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
            <span className="text-white/40">Provider / Cluster</span>
            <span className="font-mono text-white/80">SQL Server (SSMS) · Active</span>
          </div>
        </div>
      </div>

      {/* Registered People Panel with Search */}
      <div className="interactive-panel rounded-2xl border border-white/[0.08] p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-white">Registered People</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-0.5 text-xs text-white/60">
              {people.length} {people.length === 1 ? "Subject Enrolled" : "Subjects Enrolled"}
            </span>
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-white/30 text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder="Filter subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 rounded-xl border border-white/10 bg-black/40 pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 transition-all focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            />
          </div>
        </div>

        {filteredPeople.length === 0 ? (
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-8 text-center text-xs text-white/40">
            {searchQuery
              ? "No subjects match your filter."
              : "No people registered yet. Click 'Add a Person' above to enroll subjects."}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredPeople.map((p) => (
              <div
                key={p.person_id}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/30 p-4 transition-all duration-300 hover:border-white/15 hover:bg-black/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400 text-sm">
                    👤
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Enrolled & Active
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-white/40 font-mono">
                      ID: #{p.identifier || `SUB-${p.person_id.toString().padStart(3, "0")}`} · Last updated{" "}
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "just now"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-white/60 font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                    <span>
                      {p.sample_count} {p.sample_count === 1 ? "sample" : "samples"} · {p.embedding_count}{" "}
                      {p.embedding_count === 1 ? "embedding" : "embeddings"}
                    </span>
                  </div>

                  <Link
                    to="/dataset"
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
                  >
                    <span>Inspect Vector</span>
                    <span className="text-[10px]">›</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
