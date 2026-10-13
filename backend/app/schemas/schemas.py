from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PersonCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    identifier: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)


class PersonUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None


class PersonResponse(BaseModel):
    person_id: int
    name: str
    identifier: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    is_active: bool
    sample_count: int = 0
    embedding_count: int = 0

    class Config:
        from_attributes = True


class MediaResponse(BaseModel):
    media_id: int
    person_id: int
    file_name: str
    file_type: str
    file_size_bytes: int
    duration_seconds: Optional[float]
    uploaded_at: datetime
    processing_status: str

    class Config:
        from_attributes = True


class ProcessingStatusResponse(BaseModel):
    person_id: int
    status: str
    frames_analyzed: int = 0
    faces_detected: int = 0
    high_quality_faces: int = 0
    embeddings_generated: int = 0
    message: Optional[str] = None


class GpuStatus(BaseModel):
    gpu_detected: bool
    gpu_name: Optional[str]
    cuda_available: bool
    execution_provider: str
    vram_total_mb: Optional[float] = None
    vram_used_mb: Optional[float] = None


class SystemStatus(BaseModel):
    gpu: GpuStatus
    database_connected: bool
    known_people: int
    total_embeddings: int
    recognition_threshold: float
    model_name: str


class RecognitionLogResponse(BaseModel):
    recognition_id: int
    person_id: Optional[int]
    person_name: Optional[str]
    similarity_score: float
    timestamp: datetime
    camera_source: Optional[str]
    processing_time_ms: float
    is_recognized: bool

    class Config:
        from_attributes = True
