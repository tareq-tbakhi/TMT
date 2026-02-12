from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "tmt",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "tasks.telegram_tasks.*": {"queue": "telegram.messages"},
        "tasks.alert_tasks.*": {"queue": "alerts.new"},
        "tasks.embedding_tasks.*": {"queue": "embeddings.generate"},
        "tasks.sms_tasks.*": {"queue": "sms.inbound"},
        "tasks.map_tasks.*": {"queue": "map.updates"},
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
    },
)

celery_app.autodiscover_tasks(["tasks"])
