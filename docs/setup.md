# Setup Guide

## 1. Python environment

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

If `onnxruntime-gpu` fails to install or `insightface` fails to build,
see troubleshooting.md.

## 2. SQL Server

- Install SQL Server Developer Edition (free) if not already installed.
- Install SQL Server Management Studio (SSMS).
- In SSMS, connect to your local instance (usually `localhost` or
  `localhost\SQLEXPRESS` depending on install type — check
  "Object Explorer" connection dialog for the exact instance name).
- Open `database/schema.sql`, execute it (F5). Confirm `FaceRecognitionDB`
  appears under Databases.
- Install "ODBC Driver 18 for SQL Server" from Microsoft if
  `check_environment.py` reports it missing.

## 3. Configure `.env`

Copy `backend/.env.example` to `backend/.env` and set `DATABASE_SERVER`
to match your actual instance name from the SSMS connection dialog.

## 4. Model download (one-time, needs internet)

First backend startup downloads the `buffalo_l` model pack (~350MB) into
`backend/models/`. After this, the app is fully offline-capable.

## 5. Node/frontend

```bash
cd frontend
npm install
npm run dev
```

## 6. Run

Two terminals:

```bash
# Terminal 1
cd backend && .venv\Scripts\activate && python -m uvicorn app.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Visit http://localhost:5173.
