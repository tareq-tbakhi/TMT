from typing import Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


# Placeholder secrets that must never reach production.
_INSECURE_JWT_SECRETS = {
    "",
    "secret",
    "changeme",
    "dev-jwt-secret-change-in-production",
    "change-this-to-a-random-secret-in-production",
}
_INSECURE_MASTER_KEYS = {
    "",
    "changeme",
    "dev-master-key-change-in-production",
    "change-this-to-a-random-32-byte-key",
}


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

    # Security / hardening
    # Only honour X-Forwarded-For / X-Real-IP when the app sits behind a
    # trusted reverse proxy — otherwise clients can spoof their IP to evade
    # rate limits and poison audit logs.
    TRUST_PROXY_HEADERS: bool = False

    # Rate limiting (in-memory by default; Redis-backed when available)
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_IP: int = 200          # global requests / window / IP
    RATE_LIMIT_PER_USER: int = 300        # global requests / window / authenticated user
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_AUTH_MAX: int = 10         # login / registration attempts / window / IP
    RATE_LIMIT_OTP_MAX: int = 5           # OTP / verification-code attempts / window / IP

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

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://tmt.local",
        "capacitor://localhost",
        "http://localhost",
    ]

    @field_validator("TELEGRAM_API_ID", mode="before")
    @classmethod
    def parse_telegram_api_id(cls, v):
        if v is None or v == "" or v == 0:
            return None
        return int(v)

    @model_validator(mode="after")
    def enforce_production_secrets(self):
        """Fail fast when running in production with placeholder secrets.

        With DEBUG disabled the app refuses to boot if the JWT secret or the
        encryption master key is a known development default or too short to
        provide adequate entropy. This closes the classic "weak fallback
        secret" hole (anyone who reads the public repo could forge tokens or
        decrypt medical data).
        """
        if not self.DEBUG:
            if self.JWT_SECRET in _INSECURE_JWT_SECRETS or len(self.JWT_SECRET) < 32:
                raise ValueError(
                    "Insecure JWT_SECRET: set a random secret of at least 32 "
                    "characters via the JWT_SECRET environment variable "
                    "(e.g. `openssl rand -hex 32`) before running with DEBUG=False."
                )
            if (
                self.ENCRYPTION_MASTER_KEY in _INSECURE_MASTER_KEYS
                or len(self.ENCRYPTION_MASTER_KEY) < 32
            ):
                raise ValueError(
                    "Insecure ENCRYPTION_MASTER_KEY: set a random key of at "
                    "least 32 characters via the ENCRYPTION_MASTER_KEY "
                    "environment variable before running with DEBUG=False."
                )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
