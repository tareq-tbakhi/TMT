from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "tmt",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "tasks.alert_tasks",
        "tasks.telegram_tasks",
        "tasks.embedding_tasks",
        "tasks.sms_tasks",
        "tasks.map_tasks",
        "tasks.sos_tasks",
        "tasks.verification_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "tasks.sos_tasks.*": {"queue": "sos.triage"},               # HIGH priority
        "tasks.alert_tasks.*": {"queue": "alerts.new"},
        "tasks.sms_tasks.*": {"queue": "sms.inbound"},
        "tasks.map_tasks.*": {"queue": "map.updates"},
        "tasks.telegram_tasks.*": {"queue": "intel.analysis"},       # LOW priority
        "tasks.embedding_tasks.*": {"queue": "embeddings.generate"},
        "tasks.verification_tasks.*": {"queue": "verification"},     # LOW priority
    },
    beat_schedule={
        "telegram-fetch-messages": {
            "task": "tasks.telegram_tasks.fetch_and_process_messages",
            "schedule": 300.0,  # Every 5 minutes
        },
        "gap-detection-cycle": {
            "task": "tasks.telegram_tasks.run_gap_detection",
            "schedule": 3600.0,  # Every hour
        },
        "analytics-refresh": {
            "task": "tasks.alert_tasks.refresh_analytics_cache",
            "schedule": 300.0,  # Every 5 minutes
        },
        "verify-telegram-events": {
            "task": "tasks.verification_tasks.verify_recent_telegram_events",
            "schedule": 1800.0,  # Every 30 minutes
        },
    },
)
