"""Recognition for user-supplied photos and videos (not dataset ingestion)."""
import logging
import tempfile
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.database.session import SessionLocal
from app.models.orm import Person, RecognitionLog
from app.recognition.engine import engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/recognition", tags=["recognition"])

# Sampling keeps uploaded-video recognition responsive and makes the result
# deterministic. A two-minute video produces no more than 120 analysed frames.
VIDEO_SAMPLE_SECONDS = 1.0
MAX_VIDEO_FRAMES = 120


def _media_kind(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension in settings.allowed_image_ext_set:
        return "image"
    if extension in settings.allowed_video_ext_set:
        return "video"
    raise HTTPException(status_code=400, detail="Unsupported media type.")


def _recognize_frame(frame: np.ndarray, names: dict[int, str]) -> list[dict]:
    results = []
    for face in engine.detect_faces(frame, compute_embeddings=True):
        person_id, similarity = engine.match(face.embedding) if face.embedding is not None else (None, 0.0)
        results.append({
            "bbox": list(face.bbox),
            "person_id": person_id,
            "person_name": names.get(person_id, f"Person #{person_id}") if person_id else None,
            "similarity": round(similarity, 3),
            "is_recognized": person_id is not None,
            "detection_confidence": round(face.detection_confidence, 3),
        })
    return results


def _analyze_media(path: str, kind: str, filename: str) -> dict:
    started = time.perf_counter()
    db = SessionLocal()
    try:
        # Recognition itself only needs the in-memory embedding index. Keep it
        # available when SQL Server is temporarily offline; names and logging
        # are useful enhancements, not a prerequisite for photo/video analysis.
        try:
            # SQL Server does not support ``IS 1`` for BIT columns; equality
            # compiles to the compatible ``= 1`` predicate.
            names = {
                person.PersonID: person.Name
                for person in db.query(Person).filter(Person.IsActive == True).all()  # noqa: E712
            }
        except Exception as exc:
            logger.warning("Could not load person names for media recognition: %s", exc)
            db.rollback()
            names = {}
        frame_results: list[dict] = []

        if kind == "image":
            image = cv2.imread(path)
            if image is None:
                raise ValueError("The uploaded image could not be decoded.")
            frame_results.append({"frame": 0, "time_seconds": 0, "faces": _recognize_frame(image, names)})
        else:
            capture = cv2.VideoCapture(path)
            if not capture.isOpened():
                capture.release()
                raise ValueError("The uploaded video could not be decoded.")
            try:
                fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
                frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                duration = frame_count / fps if frame_count else 0.0
                interval = max(1, int(fps * VIDEO_SAMPLE_SECONDS))
                index = 0
                while len(frame_results) < MAX_VIDEO_FRAMES:
                    ok, frame = capture.read()
                    if not ok:
                        break
                    if index % interval == 0:
                        frame_results.append({
                            "frame": index,
                            "time_seconds": round(index / fps, 2),
                            "faces": _recognize_frame(frame, names),
                        })
                    index += 1
            finally:
                capture.release()

        all_faces = [face for item in frame_results for face in item["faces"]]
        recognized = [face for face in all_faces if face["is_recognized"]]
        matched_people = Counter(face["person_name"] for face in recognized if face["person_name"])
        elapsed_ms = (time.perf_counter() - started) * 1000

        # Log recognised appearances once per sampled frame, matching the live
        # recognition audit trail while identifying the uploaded source.
        try:
            for face in recognized:
                db.add(RecognitionLog(
                    PersonID=face["person_id"], SimilarityScore=face["similarity"],
                    CameraSource=f"upload:{filename}", ProcessingTimeMs=elapsed_ms,
                    IsRecognized=True,
                ))
            if recognized:
                db.commit()
        except Exception as exc:
            logger.warning("Could not write uploaded-media recognition logs: %s", exc)
            db.rollback()

        return {
            "media_type": kind,
            "frames_analyzed": len(frame_results),
            "faces_detected": len(all_faces),
            "recognized_faces": len(recognized),
            "unknown_faces": len(all_faces) - len(recognized),
            "recognized_people": [{"name": name, "appearances": count} for name, count in matched_people.most_common()],
            "processing_ms": round(elapsed_ms, 1),
            "duration_seconds": round(duration, 2) if kind == "video" else None,
            "frame_results": frame_results,
        }
    finally:
        db.close()


@router.post("/media")
async def recognize_media(file: UploadFile = File(...)):
    """Match faces in an uploaded image or sampled video frames against enrolled people."""
    filename = file.filename or "upload"
    kind = _media_kind(filename)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(contents) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit.")

    suffix = Path(filename).suffix.lower()
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            temporary.write(contents)
            temp_path = temporary.name
        return await run_in_threadpool(_analyze_media, temp_path, kind, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("Uploaded media recognition failed")
        raise HTTPException(status_code=500, detail="Unable to analyze the uploaded media.")
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
