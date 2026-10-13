import { Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ParticleBackground from "./animations/ParticleBackground";
import Dashboard from "./pages/Dashboard";
import LiveRecognition from "./pages/LiveRecognition";
import Dataset from "./pages/Dataset";
import System from "./pages/System";
import MediaRecognition from "./pages/MediaRecognition";

export default function App() {
  const location = useLocation();
  const liveRecognitionActive = location.pathname === "/live";

  return (
    <div className="app-shell min-h-screen overflow-hidden">
      <ParticleBackground lightweight={liveRecognitionActive} />
      <Sidebar />
      <main className="min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<LiveRecognition />} />
          <Route path="/media" element={<MediaRecognition />} />
          <Route path="/dataset" element={<Dataset />} />
          <Route path="/system" element={<System />} />
        </Routes>
      </main>
    </div>
  );
}
