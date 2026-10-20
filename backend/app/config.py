"""
Centralized configuration. All paths and settings come from environment
variables (loaded from .env) — no hardcoded paths or credentials anywhere
else in the codebase.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_server: str = "localhost"
    database_name: str = "FaceRecognitionDB"
    database_driver: str = "ODBC Driver 18 for SQL Server"
    database_use_sql_auth: bool = False
    database_user: str = ""
    database_password: str = ""

    # AI
    ai_device: str = "cuda"
    ai_model_name: str = "buffalo_l"
    ai_model_path: str = "./models"
    dataset_path: str = "./dataset"
    recognition_threshold: float = 0.45
    detection_size: int = 320

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    # Uploads
    max_upload_size_mb: int = 500
    allowed_video_extensions: str = ".mp4,.mov,.webm,.avi"
    allowed_image_extensions: str = ".jpg,.jpeg,.png,.webp"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_video_ext_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_video_extensions.split(",")}

    @property
    def allowed_image_ext_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_image_extensions.split(",")}

    @property
    def model_path_resolved(self) -> Path:
        p = Path(self.ai_model_path).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def dataset_path_resolved(self) -> Path:
        p = Path(self.dataset_path).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def connection_string(self) -> str:
        if self.database_use_sql_auth:
            auth = f"UID={self.database_user};PWD={self.database_password};"
        else:
            auth = "Trusted_Connection=yes;"
        return (
            f"DRIVER={{{self.database_driver}}};"
            f"SERVER={self.database_server};"
            f"DATABASE={self.database_name};"
            f"{auth}"
            f"TrustServerCertificate=yes;"
        )

    @property
    def sqlalchemy_database_uri(self) -> str:
        import urllib.parse

        quoted = urllib.parse.quote_plus(self.connection_string)
        return f"mssql+pyodbc:///?odbc_connect={quoted}"


settings = Settings()
