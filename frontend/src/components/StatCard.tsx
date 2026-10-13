import { motion } from "framer-motion";

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "success" | "danger" | "warn";
}

const toneColors: Record<string, string> = {
  default: "text-white",
  success: "text-success",
  danger: "text-danger",
  warn: "text-warn",
};

export default function StatCard({ label, value, sub, tone = "default" }: Props) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
      className="interactive-panel min-h-40 cursor-default rounded-xl border border-border bg-panel/70 p-6 backdrop-blur-sm"
    >
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneColors[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
    </motion.div>
  );
}
