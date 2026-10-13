"""
Core recognition engine. Singleton loaded once at app startup.

Responsibilities:
  - Load SCRFD (detection) + ArcFace (recognition) via InsightFace, on GPU
    if available, with automatic CPU fallback.
  - Detect faces + landmarks in a frame.
  - Generate 512-d embeddings for aligned face crops.
  - Maintain an in-memory matrix of all known embeddings for fast
    cosine-similarity search (brute-force matmul; fine at this scale).
"""
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import cv2
import onnxruntime as ort
from insightface.app import FaceAnalysis

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class DetectedFace:
    bbox: tuple  # (x1, y1, x2, y2)
    landmarks: np.ndarray
    detection_confidence: float
    embedding: Optional[np.ndarray] = None


@dataclass
class GpuInfo:
    gpu_detected: bool = False
    gpu_name: Optional[str] = None
    cuda_available: bool = False
    execution_provider: str = "CPUExecutionProvider"


class RecognitionEngine:
    """Loaded once and shared across the app (see main.py lifespan)."""

    def __init__(self):
        self._app: Optional[FaceAnalysis] = None
        self._gpu_info = GpuInfo()
        self._known_ids: list[int] = []  # PersonID per row of _known_matrix
        self._known_matrix: Optional[np.ndarray] = None  # shape (N, 512), L2-normalized
        self.threshold = settings.recognition_threshold

    def initialize(self):
        available_providers = ort.get_available_providers()
        logger.info(f"Available ONNX Runtime providers: {available_providers}")

        want_gpu = settings.ai_device == "cuda" and "CUDAExecutionProvider" in available_providers
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if want_gpu else ["CPUExecutionProvider"]

        self._app = FaceAnalysis(
            name=settings.ai_model_name,
            root=str(settings.model_path_resolved),
            providers=providers,
        )
        det_size = (settings.detection_size, settings.detection_size)
        ctx_id = 0 if want_gpu else -1
        self._app.prepare(ctx_id=ctx_id, det_size=det_size)

        self._gpu_info.cuda_available = "CUDAExecutionProvider" in available_providers
        self._gpu_info.gpu_detected = self._gpu_info.cuda_available
        self._gpu_info.execution_provider = "CUDAExecutionProvider" if want_gpu else "CPUExecutionProvider"
        if want_gpu:
            self._gpu_info.gpu_name = self._get_gpu_name()

        logger.info(
            f"Recognition engine initialized. Provider: {self._gpu_info.execution_provider}, "
            f"GPU: {self._gpu_info.gpu_name}"
        )

    @staticmethod
    def _get_gpu_name() -> Optional[str]:
        try:
            import subprocess
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                return result.stdout.strip().split("\n")[0]
        except Exception:
            pass
        return None

    @property
    def gpu_info(self) -> GpuInfo:
        return self._gpu_info

    def detect_faces(self, frame_bgr: np.ndarray, compute_embeddings: bool = True) -> list[DetectedFace]:
        """Detect faces; only run ArcFace embedding when a recognition pass needs it."""
        if self._app is None:
            raise RuntimeError("RecognitionEngine not initialized")

        MIN_DET_CONFIDENCE = 0.55

        if not compute_embeddings:
            bboxes, landmarks = self._app.det_model.detect(frame_bgr)
            if bboxes is None or landmarks is None:
                return []
            return [
                DetectedFace(
                    bbox=tuple(int(v) for v in bbox[:4]),
                    landmarks=landmark,
                    detection_confidence=float(bbox[4]),
                )
                for bbox, landmark in zip(bboxes, landmarks)
                if float(bbox[4]) >= MIN_DET_CONFIDENCE
            ]

        faces = self._app.get(frame_bgr)
        results = []
        for f in faces:
            if float(f.det_score) < MIN_DET_CONFIDENCE:
                continue
            bbox = tuple(int(v) for v in f.bbox)
            embedding = f.normed_embedding.astype(np.float32) if f.normed_embedding is not None else None
            results.append(
                DetectedFace(
                    bbox=bbox,
                    landmarks=f.kps,
                    detection_confidence=float(f.det_score),
                    embedding=embedding,
                )
            )
        return results

    def load_known_embeddings(self, person_ids: list[int], embeddings: list[np.ndarray]):
        """Called at startup and whenever the dataset changes."""
        if not embeddings:
            self._known_ids = []
            self._known_matrix = None
            logger.info("No known embeddings loaded — all faces will show as Unknown.")
            return
        matrix = np.stack(embeddings).astype(np.float32)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1e-8
        self._known_matrix = matrix / norms
        self._known_ids = list(person_ids)
        logger.info(f"Loaded {len(person_ids)} known embeddings for recognition.")

    def match(self, embedding: np.ndarray) -> tuple[Optional[int], float]:
        """Cosine similarity search. Returns (person_id or None, best_similarity)."""
        if self._known_matrix is None or len(self._known_ids) == 0:
            return None, 0.0
        norm = np.linalg.norm(embedding)
        if norm == 0:
            return None, 0.0
        query = embedding / norm
        sims = self._known_matrix @ query  # (N,)
        best_idx = int(np.argmax(sims))
        best_score = float(sims[best_idx])
        if best_score >= self.threshold:
            return self._known_ids[best_idx], best_score
        return None, best_score

    def quality_score(self, frame_bgr: np.ndarray, bbox: tuple, det_confidence: float) -> float:
        """
        Composite quality score in [0,1] used to filter/rank dataset samples.
        Combines: detection confidence, face size, and blur (Laplacian variance).
        """
        x1, y1, x2, y2 = bbox
        h, w = frame_bgr.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            return 0.0

        crop = frame_bgr[y1:y2, x1:x2]
        face_h = y2 - y1
        size_score = min(1.0, face_h / 160.0)  # 160px+ tall face -> full score

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        blur_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        blur_score = min(1.0, blur_var / 150.0)  # empirical threshold for "sharp enough"

        brightness = float(np.mean(gray))
        brightness_score = 1.0 - min(1.0, abs(brightness - 130) / 130.0)

        return float(0.4 * det_confidence + 0.3 * size_score + 0.2 * blur_score + 0.1 * brightness_score)


# Module-level singleton, initialized in main.py startup
engine = RecognitionEngine()
