from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database.session import get_db, check_connection
from app.models.orm import Person, FaceEmbedding, RecognitionLog
from app.schemas.schemas import SystemStatus, GpuStatus, RecognitionLogResponse
from app.recognition.engine import engine
from app.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status", response_model=SystemStatus)
def system_status(db: Session = Depends(get_db)):
    gpu = engine.gpu_info
    known_people = db.query(func.count(Person.PersonID)).filter(Person.IsActive == True).scalar()  # noqa: E712
    total_embeddings = db.query(func.count(FaceEmbedding.EmbeddingID)).scalar()

    return SystemStatus(
        gpu=GpuStatus(
            gpu_detected=gpu.gpu_detected,
            gpu_name=gpu.gpu_name,
            cuda_available=gpu.cuda_available,
            execution_provider=gpu.execution_provider,
        ),
        database_connected=check_connection(),
        known_people=known_people or 0,
        total_embeddings=total_embeddings or 0,
        recognition_threshold=engine.threshold,
        model_name=settings.ai_model_name,
    )


@router.get("/gpu", response_model=GpuStatus)
def gpu_status():
    gpu = engine.gpu_info
    return GpuStatus(
        gpu_detected=gpu.gpu_detected,
        gpu_name=gpu.gpu_name,
        cuda_available=gpu.cuda_available,
        execution_provider=gpu.execution_provider,
    )


@router.put("/threshold")
def set_threshold(threshold: float):
    engine.threshold = max(0.0, min(1.0, threshold))
    return {"threshold": engine.threshold}


@router.get("/recognition/logs", response_model=list[RecognitionLogResponse])
def recognition_logs(limit: int = 50, db: Session = Depends(get_db)):
    rows = (
        db.query(RecognitionLog, Person.Name)
        .outerjoin(Person, Person.PersonID == RecognitionLog.PersonID)
        .order_by(RecognitionLog.Timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        RecognitionLogResponse(
            recognition_id=log.RecognitionID,
            person_id=log.PersonID,
            person_name=name,
            similarity_score=log.SimilarityScore,
            timestamp=log.Timestamp,
            camera_source=log.CameraSource,
            processing_time_ms=log.ProcessingTimeMs,
            is_recognized=log.IsRecognized,
        )
        for log, name in rows
    ]


@router.delete("/recognition/logs")
def clear_recognition_logs(db: Session = Depends(get_db)):
    db.query(RecognitionLog).delete()
    db.commit()
    return {"status": "ok"}
