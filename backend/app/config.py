from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TMT - Triage & Monitor for Threats"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://tmt_user:tmt_dev_password@localhost:5432/tmt"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Qdrant
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "tmt_intelligence"

    # JWT Auth
    JWT_SECRET: str = "dev-jwt-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24  # 24 hours

    # Encryption
    ENCRYPTION_MASTER_KEY: str = "dev-master-key-change-in-production"

    # Twilio (SMS)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""

    # GLM-5 (Zhipu AI)
    GLM_API_KEY: str = ""

    # Telegram
    TELEGRAM_API_ID: Optional[int] = None
    TELEGRAM_API_HASH: str = ""
    TELEGRAM_PHONE: str = ""

    @field_validator("TELEGRAM_API_ID", mode="before")
    @classmethod
    def parse_telegram_api_id(cls, v):
        if v is None or v == "" or v == 0:
            return None
        return int(v)

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
