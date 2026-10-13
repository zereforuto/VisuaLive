from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, BigInteger, String, Float, Boolean, DateTime,
    ForeignKey, LargeBinary, CheckConstraint
)
from sqlalchemy.orm import relationship

from app.database.session import Base


def utcnow():
    return datetime.now(timezone.utc)


class Person(Base):
    __tablename__ = "Persons"

    PersonID = Column(Integer, primary_key=True, autoincrement=True)
    Name = Column(String(200), nullable=False)
    Identifier = Column(String(100), nullable=False, unique=True)
    Description = Column(String(1000), nullable=True)
    CreatedAt = Column(DateTime, default=utcnow, nullable=False)
    UpdatedAt = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    IsActive = Column(Boolean, default=True, nullable=False)

    media = relationship("DatasetMedia", back_populates="person", cascade="all, delete-orphan")
    embeddings = relationship("FaceEmbedding", back_populates="person", cascade="all, delete-orphan")


class DatasetMedia(Base):
    __tablename__ = "DatasetMedia"

    MediaID = Column(Integer, primary_key=True, autoincrement=True)
    PersonID = Column(Integer, ForeignKey("Persons.PersonID", ondelete="CASCADE"), nullable=False)
    FileName = Column(String(260), nullable=False)
    FilePath = Column(String(500), nullable=False)
    FileType = Column(String(10), nullable=False)
    FileSizeBytes = Column(BigInteger, nullable=False)
    DurationSeconds = Column(Float, nullable=True)
    UploadedAt = Column(DateTime, default=utcnow, nullable=False)
    ProcessingStatus = Column(String(20), default="pending", nullable=False)

    __table_args__ = (
        CheckConstraint(
            "ProcessingStatus IN ('pending','processing','completed','failed')",
            name="ck_processing_status",
        ),
    )

    person = relationship("Person", back_populates="media")
    embeddings = relationship("FaceEmbedding", back_populates="media")


class FaceEmbedding(Base):
    __tablename__ = "FaceEmbeddings"

    EmbeddingID = Column(Integer, primary_key=True, autoincrement=True)
    PersonID = Column(Integer, ForeignKey("Persons.PersonID", ondelete="CASCADE"), nullable=False)
    MediaID = Column(Integer, ForeignKey("DatasetMedia.MediaID", ondelete="NO ACTION"), nullable=True)
    EmbeddingData = Column(LargeBinary, nullable=False)  # numpy float32[512].tobytes()
    EmbeddingModel = Column(String(50), default="arcface_w600k_r50", nullable=False)
    EmbeddingDimension = Column(Integer, default=512, nullable=False)
    DetectionConfidence = Column(Float, nullable=False)
    QualityScore = Column(Float, nullable=False)
    FaceCropPath = Column(String(500), nullable=True)
    CreatedAt = Column(DateTime, default=utcnow, nullable=False)

    person = relationship("Person", back_populates="embeddings")
    media = relationship("DatasetMedia", back_populates="embeddings")


class RecognitionLog(Base):
    __tablename__ = "RecognitionLogs"

    RecognitionID = Column(BigInteger, primary_key=True, autoincrement=True)
    PersonID = Column(Integer, ForeignKey("Persons.PersonID", ondelete="SET NULL"), nullable=True)
    SimilarityScore = Column(Float, nullable=False)
    Timestamp = Column(DateTime, default=utcnow, nullable=False)
    CameraSource = Column(String(100), nullable=True)
    ProcessingTimeMs = Column(Float, nullable=False)
    IsRecognized = Column(Boolean, nullable=False)
