# Local Face Detection & Recognition System

A local-first, GPU-accelerated face recognition web application. Detects faces
from a live webcam feed, matches them against a locally stored dataset, and
displays recognized identities with similarity scores in real time.

## Features

- Person/dataset management (add, edit, deactivate, delete)
- Photo and video (.mp4/.mov) upload with intelligent frame sampling,
  quality filtering, and deduplication
- GPU-accelerated face detection (SCRFD) and recognition (ArcFace) via
  ONNX Runtime, with automatic CPU fallback
- Real-time webcam recognition over WebSocket, with multi-face support,
  temporal label smoothing, and unknown-face handling
- SQL Server-backed dataset storage (Persons, DatasetMedia, FaceEmbeddings,
  RecognitionLogs)
- System diagnostics: GPU/CUDA status, database connectivity, live FPS/latency
- Fully local after initial setup — no cloud services required for operation

## Architecture

```
Browser (React/TS) --WebSocket--> FastAPI backend --> ONNX Runtime (CUDA/CPU)
                    --REST-------> FastAPI backend --> SQL Server (local)
```

See `docs/architecture.md` for the full pipeline breakdown.

## Requirements

### Hardware
- NVIDIA GPU (tested target: RTX 5050 Laptop GPU) — optional; CPU fallback works
- Webcam

### Software
- Windows 10/11
- Python 3.11
- Node.js 20 LTS
- SQL Server Developer Edition (or Express) + SSMS
- ODBC Driver 18 for SQL Server
- NVIDIA driver 566.xx+ (only if using GPU)

## Setup

### 1. Verify your environment

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python ..\check_environment.py   # see docs/setup.md if this reports failures
```

### 2. Database

Open `database/schema.sql` in SQL Server Management Studio (connected to
your local instance) and execute it. This creates `FaceRecognitionDB` with
all required tables.

### 3. Backend configuration

```bash
cd backend
copy .env.example .env
```

Edit `.env` — at minimum confirm `DATABASE_SERVER` matches your SQL Server
instance name (often `localhost` or `localhost\SQLEXPRESS`).

### 4. Run the backend

```bash
cd backend
.venv\Scripts\activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

First startup downloads the InsightFace `buffalo_l` model pack into
`backend/models/` (one-time, requires internet). Subsequent startups load
from disk — fully offline.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## Usage

1. **Dataset page**: add a person, upload a reference photo or video.
   Processing runs automatically — watch the progress panel for frames
   analyzed / faces detected / embeddings generated.
2. **Live Recognition page**: click Start Camera. Detected faces are
   boxed and labeled with the matched person and similarity score, or
   marked Unknown. Adjust the sensitivity slider to tune the match
   threshold.
3. **Dashboard**: overview of registered people and system health.
4. **System page**: GPU/CUDA status, database connectivity, recent
   recognition log.

## Troubleshooting

See `docs/troubleshooting.md`. Most first-run issues are either an ODBC
driver/instance-name mismatch (fix in `.env`) or `onnxruntime-gpu` not
finding a compatible CUDA runtime (falls back to CPU automatically — check
the System page's Execution Provider value).

## Privacy

All biometric data (face crops, embeddings) stays on this machine in
`backend/dataset/` and the local SQL Server database. Delete a person via
the Dataset page (hard delete) to cascade-remove their media, embeddings,
and files. Clear recognition history from the System page.
