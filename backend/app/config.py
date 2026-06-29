import logging
from typing import Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)

# Known-insecure development defaults. These are acceptable for local dev but
# MUST never reach a production deployment.
_DEV_JWT_SECRET = "dev-jwt-secret-change-in-production"
_DEV_MASTER_KEY = "dev-master-key-change-in-production"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TMT - Triage & Monitor for Threats"
    APP_VERSION: str = "1.0.0"
    # Default OFF: avoids SQL echo (which logs PHI-bearing queries) and verbose
    # error leakage unless a developer explicitly opts in via DEBUG=true.
    DEBUG: bool = False
    # "development" | "staging" | "production". Production fails closed on
    # insecure secrets / wildcard CORS (see _enforce_production_security).
    ENVIRONMENT: str = "development"
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

    # GLM (Z.ai / Zhipu AI)
    GLM_API_KEY: str = ""

    # ── GLM model selection — "best for each task" (Z.ai catalog, 2026) ──
    # OpenAI-compatible base URL.
    GLM_API_BASE: str = "https://api.z.ai/api/paas/v4"
    # Reasoning / triage / intel / conversational AI — current flagship.
    GLM_MODEL_REASONING: str = "glm-5.2"
    # Image understanding — analyse citizen-uploaded photos / scene breakdown.
    GLM_MODEL_VISION: str = "glm-5v-turbo"
    # Document OCR (IDs, medical docs) — dedicated low-cost model.
    GLM_MODEL_OCR: str = "glm-ocr"
    # Image generation (situational graphics, if needed).
    GLM_MODEL_IMAGE: str = "glm-image"

    # Telegram
    TELEGRAM_API_ID: Optional[int] = None
    TELEGRAM_API_HASH: str = ""
    TELEGRAM_PHONE: str = ""

    # Telegram user-session ingestion (covert scraping) — DEFAULT OFF.
    #
    # LEGALLY SENSITIVE: this path signs in with a real USER account (phone
    # number) via Telethon, auto-joins channels (JoinChannelRequest) and
    # scrapes messages (iter_messages). That activity can violate Telegram's
    # Terms of Service and data-protection law (GDPR / lawful-basis,
    # data-minimisation, consent). It MUST only be enabled after a documented
    # compliance review and recorded consent / legal basis. Leave this False
    # in any environment that has not completed that review.
    TELEGRAM_INGESTION_ENABLED: bool = False

    def telegram_ingestion_allowed(self) -> bool:
        """Pure guard: True only when user-session scraping is deliberately
        enabled. Default-off control point for every join/scrape entry point.
        """
        return bool(self.TELEGRAM_INGESTION_ENABLED)

    @field_validator("TELEGRAM_API_ID", mode="before")
    @classmethod
    def parse_telegram_api_id(cls, v):
        if v is None or v == "" or v == 0:
            return None
        return int(v)

    # Human-in-the-Loop (HITL) approval gate.
    # When True, HIGH/CRITICAL severity alerts from automated sources are held
    # as "pending_approval" (NOT broadcast, NOT patient-notified) until a human
    # explicitly approves them. See app/services/alert_approval.py for the rule.
    HITL_REQUIRED: bool = True

    # CORS — wildcard is convenient for local dev; production must set an
    # explicit allow-list (enforced below).
    CORS_ORIGINS: list[str] = ["*"]

    @model_validator(mode="after")
    def _enforce_production_security(self) -> "Settings":
        """Fail closed in production on insecure config; warn loudly in dev."""
        is_prod = self.ENVIRONMENT.lower() == "production"
        problems: list[str] = []
        if self.JWT_SECRET == _DEV_JWT_SECRET:
            problems.append("JWT_SECRET is the public dev default")
        if self.ENCRYPTION_MASTER_KEY == _DEV_MASTER_KEY:
            problems.append("ENCRYPTION_MASTER_KEY is the public dev default")
        if "*" in self.CORS_ORIGINS:
            problems.append("CORS_ORIGINS is a wildcard")
        if problems:
            msg = "Insecure configuration: " + "; ".join(problems)
            if is_prod:
                raise ValueError(
                    msg + ". Set real secrets and an explicit CORS allow-list "
                    "before deploying to production."
                )
            logger.warning("%s (allowed because ENVIRONMENT=%s)", msg, self.ENVIRONMENT)
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
