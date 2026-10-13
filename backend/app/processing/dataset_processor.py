"""
Dataset processing pipeline: video/photo -> sampled frames -> quality
filtering -> deduplication -> embeddings stored in the database.

Does NOT store every frame. Samples at a fixed rate, rejects low-quality
detections, deduplicates near-identical faces via embedding distance,
and keeps only the top-N highest quality samples per person per upload.
"""
import logging
import uuid
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.models.orm import FaceEmbedding, DatasetMedia
from app.recognition.engine import engine, DetectedFace

logger = logging.getLogger(__name__)

SAMPLE_FPS = 1.0             # sample ~1 frame per second of video
MIN_DET_CONFIDENCE = 0.6
MIN_FACE_HEIGHT_PX = 80
MIN_QUALITY_SCORE = 0.45
MAX_SAMPLES_PER_UPLOAD = 20
DEDUP_SIMILARITY_THRESHOLD = 0.9  # embeddings more similar than this are treated as duplicates


class ProcessingProgress:
    def __init__(self):
        self.frames_analyzed = 0
        self.faces_detected = 0
        self.high_quality_faces = 0
        self.embeddings_generated = 0
        self.status = "processing"
        self.message = ""


def _accept_face(frame: np.ndarray, face: DetectedFace) -> tuple[bool, float]:
    if face.detection_confidence < MIN_DET_CONFIDENCE:
        return False, 0.0
    x1, y1, x2, y2 = face.bbox
    if (y2 - y1) < MIN_FACE_HEIGHT_PX:
        return False, 0.0
    quality = engine.quality_score(frame, face.bbox, face.detection_confidence)
    if quality < MIN_QUALITY_SCORE:
        return False, quality
    return True, quality


def _is_duplicate(embedding: np.ndarray, accepted: list[np.ndarray]) -> bool:
    if not accepted:
        return False
    norm = np.linalg.norm(embedding)
    if norm == 0:
        return True
    q = embedding / norm
    for other in accepted:
        other_norm = np.linalg.norm(other)
        if other_norm == 0:
            continue
        sim = float(np.dot(q, other / other_norm))
        if sim >= DEDUP_SIMILARITY_THRESHOLD:
            return True
    return False


def process_image(
    db: Session, person_id: int, media_id: int, image_path: Path,
    progress: ProcessingProgress,
) -> None:
    frame = cv2.imread(str(image_path))
    if frame is None:
        progress.status = "failed"
        progress.message = "Could not read image file."
        return

    progress.frames_analyzed = 1
    faces = engine.detect_faces(frame)
    progress.faces_detected = len(faces)

    if not faces:
        progress.status = "failed"
        progress.message = "No face detected in uploaded image."
        return

    # Use the largest face if multiple are present in a single reference photo.
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    accepted, quality = _accept_face(frame, face)
    if not accepted or face.embedding is None:
        progress.status = "failed"
        progress.message = f"Face did not meet quality threshold (score={quality:.2f})."
        return

    progress.high_quality_faces = 1
    crop_path = _save_face_crop(person_id, face, frame)
    _store_embedding(db, person_id, media_id, face, quality, crop_path)
    progress.embeddings_generated = 1
    progress.status = "completed"


def process_video(
    db: Session, person_id: int, media_id: int, video_path: Path,
    progress: ProcessingProgress,
) -> None:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        progress.status = "failed"
        progress.message = "Could not open video file (unsupported or corrupt)."
        return

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_interval = max(1, int(round(native_fps / SAMPLE_FPS)))

    accepted_embeddings: list[np.ndarray] = []
    candidates: list[tuple[float, np.ndarray, DetectedFace]] = []  # (quality, frame_copy, face)

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval == 0:
            progress.frames_analyzed += 1
            faces = engine.detect_faces(frame)
            progress.faces_detected += len(faces)
            for face in faces:
                accepted, quality = _accept_face(frame, face)
                if accepted and face.embedding is not None:
                    progress.high_quality_faces += 1
                    candidates.append((quality, frame.copy(), face))
        frame_idx += 1
    cap.release()

    if not candidates:
        progress.status = "failed"
        progress.message = "No high-quality faces found in video."
        return

    # Rank by quality, deduplicate, keep top N
    candidates.sort(key=lambda c: c[0], reverse=True)
    kept = 0
    for quality, frame, face in candidates:
        if kept >= MAX_SAMPLES_PER_UPLOAD:
            break
        if _is_duplicate(face.embedding, accepted_embeddings):
            continue
        crop_path = _save_face_crop(person_id, face, frame)
        _store_embedding(db, person_id, media_id, face, quality, crop_path)
        accepted_embeddings.append(face.embedding)
        kept += 1

    progress.embeddings_generated = kept
    progress.status = "completed" if kept > 0 else "failed"
    if kept == 0:
        progress.message = "All candidate faces were filtered as duplicates or low quality."


def _save_face_crop(person_id: int, face: DetectedFace, frame: np.ndarray) -> str:
    x1, y1, x2, y2 = face.bbox
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    crop = frame[y1:y2, x1:x2]

    person_dir = settings.dataset_path_resolved / "persons" / str(person_id) / "faces"
    person_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.jpg"
    out_path = person_dir / filename
    cv2.imwrite(str(out_path), crop)
    return str(out_path)


def _store_embedding(
    db: Session, person_id: int, media_id: int, face: DetectedFace,
    quality: float, crop_path: str,
) -> None:
    row = FaceEmbedding(
        PersonID=person_id,
        MediaID=media_id,
        EmbeddingData=face.embedding.tobytes(),
        EmbeddingModel="arcface_w600k_r50",
        EmbeddingDimension=face.embedding.shape[0],
        DetectionConfidence=face.detection_confidence,
        QualityScore=quality,
        FaceCropPath=crop_path,
    )
    db.add(row)
    db.commit()


def reload_known_embeddings(db: Session) -> None:
    """Refresh the engine's in-memory embedding matrix from the database."""
    rows = db.query(FaceEmbedding).join(FaceEmbedding.person).filter_by(IsActive=True).all()
    person_ids = []
    embeddings = []
    for row in rows:
        vec = np.frombuffer(row.EmbeddingData, dtype=np.float32)
        person_ids.append(row.PersonID)
        embeddings.append(vec)
    engine.load_known_embeddings(person_ids, embeddings)
