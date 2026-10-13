-- Face Recognition Database Schema
-- Run in SQL Server Management Studio (SSMS) against a local instance.

IF DB_ID('FaceRecognitionDB') IS NULL
BEGIN
    CREATE DATABASE FaceRecognitionDB;
END
GO

USE FaceRecognitionDB;
GO

IF OBJECT_ID('RecognitionLogs', 'U') IS NOT NULL DROP TABLE RecognitionLogs;
IF OBJECT_ID('FaceEmbeddings', 'U') IS NOT NULL DROP TABLE FaceEmbeddings;
IF OBJECT_ID('DatasetMedia', 'U') IS NOT NULL DROP TABLE DatasetMedia;
IF OBJECT_ID('Persons', 'U') IS NOT NULL DROP TABLE Persons;
GO

CREATE TABLE Persons (
    PersonID        INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(200) NOT NULL,
    Identifier      NVARCHAR(100) NOT NULL UNIQUE,
    Description     NVARCHAR(1000) NULL,
    CreatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    IsActive        BIT NOT NULL DEFAULT 1
);
GO

CREATE TABLE DatasetMedia (
    MediaID           INT IDENTITY(1,1) PRIMARY KEY,
    PersonID          INT NOT NULL,
    FileName          NVARCHAR(260) NOT NULL,
    FilePath          NVARCHAR(500) NOT NULL,
    FileType          NVARCHAR(10) NOT NULL,
    FileSizeBytes     BIGINT NOT NULL,
    DurationSeconds   FLOAT NULL,
    UploadedAt        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ProcessingStatus  NVARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (ProcessingStatus IN ('pending','processing','completed','failed')),
    CONSTRAINT FK_DatasetMedia_Persons FOREIGN KEY (PersonID)
        REFERENCES Persons(PersonID) ON DELETE CASCADE
);
GO
CREATE INDEX IX_DatasetMedia_PersonID ON DatasetMedia(PersonID);
GO

CREATE TABLE FaceEmbeddings (
    EmbeddingID          INT IDENTITY(1,1) PRIMARY KEY,
    PersonID             INT NOT NULL,
    MediaID              INT NULL,
    EmbeddingData        VARBINARY(MAX) NOT NULL,
    EmbeddingModel       NVARCHAR(50) NOT NULL DEFAULT 'arcface_w600k_r50',
    EmbeddingDimension   INT NOT NULL DEFAULT 512,
    DetectionConfidence  FLOAT NOT NULL,
    QualityScore         FLOAT NOT NULL,
    FaceCropPath         NVARCHAR(500) NULL,
    CreatedAt            DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FaceEmbeddings_Persons FOREIGN KEY (PersonID)
        REFERENCES Persons(PersonID) ON DELETE CASCADE,
    CONSTRAINT FK_FaceEmbeddings_Media FOREIGN KEY (MediaID)
    REFERENCES DatasetMedia(MediaID) ON DELETE NO ACTION
);
GO
CREATE INDEX IX_FaceEmbeddings_PersonID ON FaceEmbeddings(PersonID);
GO

CREATE TABLE RecognitionLogs (
    RecognitionID     BIGINT IDENTITY(1,1) PRIMARY KEY,
    PersonID          INT NULL,
    SimilarityScore   FLOAT NOT NULL,
    Timestamp         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CameraSource      NVARCHAR(100) NULL,
    ProcessingTimeMs  FLOAT NOT NULL,
    IsRecognized      BIT NOT NULL,
    CONSTRAINT FK_RecognitionLogs_Persons FOREIGN KEY (PersonID)
        REFERENCES Persons(PersonID) ON DELETE SET NULL
);
GO
CREATE INDEX IX_RecognitionLogs_Timestamp ON RecognitionLogs(Timestamp DESC);
GO

PRINT 'FaceRecognitionDB schema created successfully.';
