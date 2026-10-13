import { useEffect, useState } from "react";
import { SystemAPI, SystemStatus } from "../services/api";

export default function System() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      setStatus(await SystemAPI.status());
      setLogs(await SystemAPI.logs(20));
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page-shell">
      <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">System Diagnostics</h2>
      <p className="text-white/50 text-xs mb-6 font-mono">Hardware, AI backend, and recognition status</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Panel title="Hardware / AI" accentColor="emerald">
          <Row label="GPU Detected" value={status?.gpu.gpu_detected ? "Yes" : "No"} />
          <Row label="GPU Name" value={status?.gpu.gpu_name ?? "N/A"} />
          <Row label="CUDA Available" value={status?.gpu.cuda_available ? "Yes (CUDA Active)" : "No"} />
          <Row label="Execution Provider" value={status?.gpu.execution_provider ?? "—"} />
          <Row label="Model" value={status?.model_name ?? "buffalo_l (512-dim)"} />
        </Panel>

        <Panel title="Recognition & Database" accentColor="blue">
          <Row label="Known People" value={status?.known_people ?? 0} />
          <Row label="Total Embeddings" value={status?.total_embeddings ?? 0} />
          <Row label="Cosine Threshold" value={status?.recognition_threshold ?? "0.45"} />
          <Row
            label="Database"
            value={status?.database_connected ? "SQL Server (Connected)" : "Offline"}
            tone={status?.database_connected ? "success" : "danger"}
          />
        </Panel>
      </div>

      <div className="interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400"></span>
            Recent Recognition Events
          </h3>
          <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">Audit Trail</span>
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-white/40 font-mono py-4 text-center">No recognition events yet recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-white/40 text-[10px] uppercase font-mono border-b border-white/[0.06]">
                  <th className="pb-3">Timestamp</th>
                  <th className="pb-3">Identified Person</th>
                  <th className="pb-3">Similarity</th>
                  <th className="pb-3">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {logs.map((log) => (
                  <tr key={log.recognition_id} className="transition-colors duration-200 hover:bg-white/[0.02]">
                    <td className="py-2.5 font-mono text-white/60">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2.5 font-semibold text-white">{log.person_name ?? "Unknown"}</td>
                    <td className="py-2.5 font-mono text-emerald-400">{(log.similarity_score * 100).toFixed(1)}%</td>
                    <td className="py-2.5 font-mono text-white/50">{log.processing_time_ms.toFixed(1)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  accentColor = "blue",
}: {
  title: string;
  children: React.ReactNode;
  accentColor?: "blue" | "emerald";
}) {
  const dotColor = accentColor === "emerald" ? "bg-emerald-400" : "bg-blue-400";
  return (
    <div className="interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl">
      <h3 className="text-sm font-bold text-white tracking-wide mb-4 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`}></span>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger";
}) {
  const textColor =
    tone === "success"
      ? "text-emerald-400 font-semibold"
      : tone === "danger"
      ? "text-red-400 font-semibold"
      : "text-white font-mono";

  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 text-xs last:border-0 last:pb-0">
      <span className="text-white/50">{label}</span>
      <span className={textColor}>{value}</span>
    </div>
  );
}
