import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.session import Base, engine as db_engine, check_connection, SessionLocal
from app.recognition.engine import engine as recognition_engine
from app.processing.dataset_processor import reload_known_embeddings
from app.api import persons, dataset, system, websocket, media_recognition

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Face Recognition backend...")

    logger.info("Checking database connection...")
    if check_connection():
        Base.metadata.create_all(bind=db_engine)
        logger.info("Database ready.")
    else:
        logger.error(
            "Database connection failed at startup. Verify SQL Server is running "
            "and the .env DATABASE_* settings are correct. The app will still "
            "start, but dataset/recognition features will fail until this is fixed."
        )

    logger.info("Initializing recognition engine (GPU detection, model loading)...")
    recognition_engine.initialize()

    logger.info("Loading known embeddings into memory...")
    db = SessionLocal()
    try:
        reload_known_embeddings(db)
    finally:
        db.close()

    logger.info("Startup complete.")
    yield
    logger.info("Shutting down.")


app = FastAPI(title="Local Face Recognition API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(persons.router)
app.include_router(dataset.router)
app.include_router(system.router)
app.include_router(websocket.router)
app.include_router(media_recognition.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "face-recognition-backend"}
