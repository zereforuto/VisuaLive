import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PersonsAPI, DatasetAPI, Person, ProcessingStatus } from "../services/api";

export default function Dataset() {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPeople = async () => setPeople(await PersonsAPI.list());

  useEffect(() => {
    loadPeople();
  }, []);

  useEffect(() => {
    if (!selectedPerson || status?.status !== "processing") return;
    const interval = setInterval(async () => {
      const s = await DatasetAPI.status(selectedPerson);
      setStatus(s);
      if (s.status === "completed" || s.status === "failed") {
        clearInterval(interval);
        loadPeople();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedPerson, status?.status]);

  const addPerson = async () => {
    if (!name.trim() || !identifier.trim()) return;
    try {
      await PersonsAPI.create(name.trim(), identifier.trim());
      setName("");
      setIdentifier("");
      loadPeople();
    } catch (e: any) {
      setUploadError(e?.response?.data?.detail ?? "Failed to create person.");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPerson) return;
    setUploadError(null);
    try {
      const media = await DatasetAPI.uploadMedia(selectedPerson, file);
      await DatasetAPI.process(selectedPerson, media.media_id);
      setStatus({ person_id: selectedPerson, status: "processing", frames_analyzed: 0, faces_detected: 0, high_quality_faces: 0, embeddings_generated: 0 });
    } catch (e: any) {
      setUploadError(e?.response?.data?.detail ?? "Upload failed.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deletePerson = async (id: number) => {
    await PersonsAPI.delete(id, true);
    if (selectedPerson === id) setSelectedPerson(null);
    loadPeople();
  };

  return (
    <div className="page-shell">
      <h2 className="text-2xl font-semibold text-white mb-1">Dataset Management</h2>
      <p className="text-white/50 text-sm mb-6">Add people and upload reference photos or videos</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="interactive-panel h-fit rounded-2xl border border-white/[0.08] p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white tracking-wide mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400"></span>
            Add Person
          </h3>
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mb-2.5 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/30 transition-all focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
          />
          <input
            placeholder="Unique identifier (e.g. jsmith)"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/30 transition-all focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
          />
          <button
            onClick={addPerson}
            className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold tracking-wide cursor-pointer"
          >
            Add Person
          </button>
          {uploadError && <p className="text-danger text-xs mt-2.5">{uploadError}</p>}
        </div>

        <div className="interactive-panel rounded-2xl border border-white/[0.08] p-6 shadow-xl lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              People
            </h3>
            <span className="text-xs text-white/40 font-mono">
              {people.length} {people.length === 1 ? "Subject" : "Subjects"}
            </span>
          </div>

          <div className="space-y-2">
            {people.length === 0 && <p className="text-xs text-white/40">No people yet.</p>}
            {people.map((p) => (
              <motion.div
                key={p.person_id}
                whileHover={{ x: 2 }}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                  selectedPerson === p.person_id
                    ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                    : "border-white/[0.06] bg-black/30 hover:border-white/15 hover:bg-black/50"
                }`}
                onClick={() => setSelectedPerson(p.person_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70 text-xs">
                    👤
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{p.name}</p>
                    <p className="text-[11px] text-white/40 font-mono">
                      #{p.identifier || p.person_id} · {p.sample_count} media · {p.embedding_count} embeddings
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  title="Delete person"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePerson(p.person_id);
                  }}
                  className="group/del flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger/80 transition-all duration-300 ease-out hover:border-danger hover:bg-danger hover:text-white hover:shadow-[0_0_14px_rgba(255,84,112,0.45)]"
                >
                  <svg
                    className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover/del:scale-110"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  <span>Delete</span>
                </button>
              </motion.div>
            ))}
          </div>

          {selectedPerson && (
            <div className="mt-5 pt-5 border-t border-border">
              <h4 className="text-sm font-medium text-white/70 mb-2">Upload Reference Media</h4>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
                onChange={handleUpload}
                className="text-sm text-white/70 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:text-sm file:cursor-pointer"
              />

              {status && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>Status: {status.status}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-base overflow-hidden">
                    <motion.div
                      className="h-full bg-accent"
                      animate={{ width: status.status === "completed" ? "100%" : status.status === "processing" ? "60%" : "0%" }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-white/50 font-mono">
                    <span>Frames analyzed: {status.frames_analyzed}</span>
                    <span>Faces detected: {status.faces_detected}</span>
                    <span>High quality: {status.high_quality_faces}</span>
                    <span>Embeddings: {status.embeddings_generated}</span>
                  </div>
                  {status.message && <p className="text-xs text-warn mt-2">{status.message}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
