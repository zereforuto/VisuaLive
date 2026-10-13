"""
/ws/recognition — receives JPEG frame bytes from the browser, runs
detection every frame and full embedding/recognition every RECOGNITION_EVERY_N
frames, tracks faces with IoU matching in between, and emits JSON overlay
data (boxes, labels, similarity, FPS, latency) back to the client.

IMPORTANT: All CPU-heavy work (cv2, numpy, ONNX inference) is dispatched to a
ThreadPoolExecutor so the asyncio event loop is never blocked. Without this,
FastAPI's HTTP endpoints (e.g. /api/system/status polled by the Dashboard every
5 s) cannot be served while a frame is being processed, causing the DB-connected
indicator to flicker to "offline" during live recognition.
"""
import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from functools import partial

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database.session import SessionLocal
from app.models.orm import RecognitionLog, Person
from app.recognition.engine import engine
from app.recognition.tracker import FaceTracker, nms as bbox_nms

logger = logging.getLogger(__name__)
router = APIRouter()

RECOGNITION_EVERY_N_FRAMES = 2   # run embedding every other frame (was 3)
LOG_COOLDOWN_SECONDS = 5.0

# Dedicated thread pool for blocking recognition work.
# max_workers=1 keeps GPU memory access single-threaded and avoids ONNX
# session contention; increase only if running CPU-only with many cores.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="recog")

# ── In-memory person name cache ───────────────────────────────────────────────
_person_name_cache: dict[int, str] = {}
_person_name_cache_ts: dict[int, float] = {}
_PERSON_CACHE_TTL = 30.0  # seconds


def _get_person_name(person_id: int) -> str:
    """Fetch a person's display name, using a short-lived DB session with caching."""
    now = time.time()
    if (
        person_id in _person_name_cache
        and now - _person_name_cache_ts.get(person_id, 0) < _PERSON_CACHE_TTL
    ):
        return _person_name_cache[person_id]
    try:
        db = SessionLocal()
        try:
            person = db.query(Person).filter(Person.PersonID == person_id).first()
            name = person.Name if person else "Unknown Person"
        finally:
            db.close()
    except Exception:
        name = _person_name_cache.get(person_id, "Unknown Person")
    _person_name_cache[person_id] = name
    _person_name_cache_ts[person_id] = now
    return name


def _commit_recognition_logs(entries: list[RecognitionLog]) -> None:
    """Write recognition log rows using a fresh short-lived session."""
    if not entries:
        return
    try:
        db = SessionLocal()
        try:
            for entry in entries:
                db.add(entry)
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"Failed to write recognition log (non-fatal): {exc}")


# ── Blocking frame-processing logic (runs in thread pool) ─────────────────────

def _process_frame(
    data: bytes,
    tracker: FaceTracker,
    frame_count: int,
    last_logged: dict[int, tuple[int, float]],
) -> dict:
    """
    All CPU/GPU work for one frame. Runs in a worker thread so the event loop
    stays free to serve HTTP requests while this is executing.
    Returns a dict ready to be JSON-serialised and sent to the browser.
    """
    frame_start = time.time()

    np_arr = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {}

    detect_start = time.time()
    do_full_recognition = (frame_count % RECOGNITION_EVERY_N_FRAMES) == 0
    faces = engine.detect_faces(frame, compute_embeddings=do_full_recognition)
    detect_ms = (time.time() - detect_start) * 1000

    # Apply NMS to the raw face list so both the tracker AND the recognition
    # loop work with a de-duplicated set. Sort by confidence desc so the
    # highest-confidence detection survives when two overlap.
    if len(faces) > 1:
        faces_sorted = sorted(faces, key=lambda f: f.detection_confidence, reverse=True)
        kept_bboxes = bbox_nms([f.bbox for f in faces_sorted])
        kept_set = set(kept_bboxes)
        faces = [f for f in faces_sorted if f.bbox in kept_set]

    tracks = tracker.update([f.bbox for f in faces])

    recognition_ms = 0.0
    if do_full_recognition:
        recog_start = time.time()
        pending_logs: list[RecognitionLog] = []

        for face in faces:
            if face.embedding is None:
                continue
            track = tracker.find_nearest_track(face.bbox)
            if track is None:
                continue
            person_id, similarity = engine.match(face.embedding)
            person_name = _get_person_name(person_id) if person_id else None
            tracker.apply_recognition(track.track_id, person_id, person_name, similarity)

            previous = last_logged.get(track.track_id)
            now = time.time()
            if person_id and (
                previous is None
                or previous[0] != person_id
                or now - previous[1] >= LOG_COOLDOWN_SECONDS
            ):
                pending_logs.append(RecognitionLog(
                    PersonID=person_id,
                    SimilarityScore=similarity,
                    CameraSource="webcam",
                    ProcessingTimeMs=(time.time() - recog_start) * 1000,
                    IsRecognized=True,
                ))
                last_logged[track.track_id] = (person_id, now)

        _commit_recognition_logs(pending_logs)
        recognition_ms = (time.time() - recog_start) * 1000

    total_ms = (time.time() - frame_start) * 1000
    fps = 1000.0 / total_ms if total_ms > 0 else 0.0

    return {
        "faces": [
            {
                "track_id": t.track_id,
                "bbox": t.bbox,
                "person_id": t.person_id,
                "person_name": t.person_name,
                "similarity": round(t.similarity, 3),
                "is_recognized": t.person_id is not None,
            }
            for t in tracks
        ],
        "stats": {
            "fps": round(fps, 1),
            "detection_ms": round(detect_ms, 1),
            "recognition_ms": round(recognition_ms, 1),
            "total_ms": round(total_ms, 1),
            "faces_detected": len(faces),
            "recognized_count": sum(1 for t in tracks if t.person_id is not None),
            "unknown_count": sum(1 for t in tracks if t.person_id is None),
            "device": engine.gpu_info.execution_provider,
            "gpu_name": engine.gpu_info.gpu_name,
        },
    }


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@router.websocket("/ws/recognition")
async def recognition_stream(websocket: WebSocket):
    await websocket.accept()
    tracker = FaceTracker()
    frame_count = 0
    last_logged: dict[int, tuple[int, float]] = {}
    loop = asyncio.get_event_loop()

    try:
        while True:
            data = await websocket.receive_bytes()

            # Offload all CPU/GPU work to the thread pool.
            # The event loop is free to handle HTTP requests while this runs.
            payload = await loop.run_in_executor(
                _executor,
                partial(_process_frame, data, tracker, frame_count, last_logged),
            )

            if payload:
                await websocket.send_text(json.dumps(payload))
                frame_count += 1

    except WebSocketDisconnect:
        logger.info("Recognition WebSocket client disconnected.")
    except Exception as e:
        logger.exception(f"Recognition WebSocket error: {e}")
