import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db
from app.models.orm import Person, DatasetMedia, FaceEmbedding
from app.schemas.schemas import MediaResponse, ProcessingStatusResponse
from app.processing import dataset_processor
from app.processing.dataset_processor import ProcessingProgress, reload_known_embeddings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["dataset"])

# In-memory progress tracker per person (fine for a single-user local app).
_progress_by_person: dict[int, ProcessingProgress] = {}


def _validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in settings.allowed_video_ext_set:
        return "video"
    if ext in settings.allowed_image_ext_set:
        return "image"
    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file type '{ext}'. Allowed: "
               f"{sorted(settings.allowed_video_ext_set | settings.allowed_image_ext_set)}",
    )


@router.post("/persons/{person_id}/media", response_model=MediaResponse)
async def upload_media(
    person_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    person = db.query(Person).filter(Person.PersonID == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found.")

    file_kind = _validate_extension(file.filename)
    ext = Path(file.filename).suffix.lower()

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.max_upload_size_mb:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit.")

    person_dir = settings.dataset_path_resolved / "persons" / str(person_id) / "original"
    person_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = person_dir / safe_name
    with open(dest_path, "wb") as f:
        f.write(contents)

    media = DatasetMedia(
        PersonID=person_id,
        FileName=file.filename,
        FilePath=str(dest_path),
        FileType=file_kind,
        FileSizeBytes=len(contents),
        ProcessingStatus="pending",
    )
    db.add(media)
    db.commit()
    db.refresh(media)

    return MediaResponse(
        media_id=media.MediaID,
        person_id=media.PersonID,
        file_name=media.FileName,
        file_type=media.FileType,
        file_size_bytes=media.FileSizeBytes,
        duration_seconds=media.DurationSeconds,
        uploaded_at=media.UploadedAt,
        processing_status=media.ProcessingStatus,
    )


@router.delete("/media/{media_id}")
def delete_media(media_id: int, db: Session = Depends(get_db)):
    media = db.query(DatasetMedia).filter(DatasetMedia.MediaID == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found.")

    file_path = Path(media.FilePath)
    if file_path.exists():
        file_path.unlink(missing_ok=True)

    db.query(FaceEmbedding).filter(FaceEmbedding.MediaID == media_id).delete()
    db.delete(media)
    db.commit()
    reload_known_embeddings(db)
    return {"status": "ok"}


def _run_processing(person_id: int, media_id: int, file_path: str, file_type: str, db: Session):
    progress = ProcessingProgress()
    _progress_by_person[person_id] = progress

    media = db.query(DatasetMedia).filter(DatasetMedia.MediaID == media_id).first()
    media.ProcessingStatus = "processing"
    db.commit()

    try:
        if file_type == "video":
            dataset_processor.process_video(db, person_id, media_id, Path(file_path), progress)
        else:
            dataset_processor.process_image(db, person_id, media_id, Path(file_path), progress)
    except Exception as e:
        logger.exception("Dataset processing failed")
        progress.status = "failed"
        progress.message = str(e)

    media.ProcessingStatus = progress.status
    db.commit()
    reload_known_embeddings(db)


@router.post("/dataset/process/{person_id}")
def process_dataset(
    person_id: int, media_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    person = db.query(Person).filter(Person.PersonID == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found.")
    media = db.query(DatasetMedia).filter(DatasetMedia.MediaID == media_id, DatasetMedia.PersonID == person_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found for this person.")

    background_tasks.add_task(_run_processing, person_id, media_id, media.FilePath, media.FileType, db)
    return {"status": "processing_started", "person_id": person_id, "media_id": media_id}


@router.get("/dataset/status/{person_id}", response_model=ProcessingStatusResponse)
def get_dataset_status(person_id: int):
    progress = _progress_by_person.get(person_id)
    if not progress:
        return ProcessingStatusResponse(person_id=person_id, status="idle")
    return ProcessingStatusResponse(
        person_id=person_id,
        status=progress.status,
        frames_analyzed=progress.frames_analyzed,
        faces_detected=progress.faces_detected,
        high_quality_faces=progress.high_quality_faces,
        embeddings_generated=progress.embeddings_generated,
        message=progress.message or None,
    )
