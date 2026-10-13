# Architecture

## Layers

- **Frontend**: React + TypeScript (Vite), Tailwind CSS, Framer Motion,
  React Three Fiber for the animated background.
- **Backend**: FastAPI (async), serving REST endpoints and one WebSocket
  endpoint for live recognition.
- **AI**: InsightFace (SCRFD detector + ArcFace w600k_r50 recognizer) via
  ONNX Runtime, CUDAExecutionProvider with CPU fallback.
- **Database**: SQL Server, accessed through SQLAlchemy 2.0 + pyodbc.
- **Storage**: original uploads and face crops on local disk under
  `backend/dataset/persons/<id>/`; metadata and embeddings in SQL Server.

## Recognition pipeline

```
Camera frame -> SCRFD detect (boxes + 5 landmarks + det_confidence)
             -> align crop (112x112 via landmarks)
             -> ArcFace embed (512-d, L2-normalized)
             -> cosine similarity vs in-memory known-embeddings matrix
             -> best_score >= threshold ? recognized : unknown
```

Detection confidence and recognition similarity are tracked as distinct
values end to end — never conflated into a single "confidence" number.

## Real-time streaming

Browser captures webcam via `getUserMedia`, downsamples frames to ~480px
wide JPEGs client-side, and sends them over WebSocket at a capped ~10fps
send rate (independent of camera's native fps). Backend runs detection on
every received frame but only runs the more expensive embedding+matching
step every 3rd frame, using an IoU-based tracker to carry identity labels
across the skipped frames. A short majority-vote window per track smooths
labels so identity doesn't flicker frame to frame.

## Why these specific tradeoffs

- **Brute-force cosine similarity instead of a vector DB**: at a few
  thousand embeddings max, a single numpy matmul is sub-millisecond —
  a vector database would add operational complexity with no
  measurable benefit at this scale.
- **JPEG over WebSocket instead of WebRTC media track to backend**:
  simpler to implement correctly, and frame-rate/quality are already
  client-controlled, which is what matters for bandwidth here.
- **Embeddings in SQL Server as VARBINARY(MAX)** rather than a separate
  embedding store: keeps one source of truth, trivial data volume,
  avoids a second system to keep in sync.
