"""Celery tasks for Telegram channel trust verification.

Uses CrewAI Verification Agent for cross-referencing, with fallback
to the original rule-based pipeline.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="tasks.verification_tasks.verify_recent_telegram_events",
                 time_limit=600, soft_time_limit=570)
def verify_recent_telegram_events():
    """Verify recent Telegram-sourced events — CrewAI verification crew or direct pipeline."""
    logger.info("Starting Telegram event verification cycle")

    # Gather events to verify (needed for both paths)
    events_to_verify = _run_async(_fetch_unverified_events())

    if not events_to_verify:
        logger.info("No unverified Telegram events found")
        return {"checked": 0, "verified": 0}

    # Try CrewAI first
    try:
        from app.services.ai_agent.crews import build_verification_crew
        from app.config import get_settings

        settings = get_settings()
        if not settings.GLM_API_KEY:
            raise RuntimeError("No LLM API key")

        crew = build_verification_crew(events_to_verify)
        result = crew.kickoff()
        logger.info("CrewAI verification completed: %s", str(result.raw)[:200])

        # Mark events as verified in DB based on crew output
        _run_async(_apply_verification_results(result.raw, events_to_verify))
        return result.raw

    except Exception as e:
        logger.warning("CrewAI verification failed, using direct pipeline: %s", e)

    # Fallback: original rule-based pipeline
    return _fallback_verify(events_to_verify)


async def _fetch_unverified_events():
    """Fetch Telegram events from the last 6 hours that haven't been verified yet."""
    from sqlalchemy import select
    from app.db.postgres import async_session
    from app.models.geo_event import GeoEvent

    async with async_session() as db:
        cutoff = datetime.utcnow() - timedelta(hours=6)
        result = await db.execute(
            select(GeoEvent)
            .where(
                GeoEvent.created_at >= cutoff,
                GeoEvent.source == "telegram",
            )
            .order_by(GeoEvent.created_at.desc())
            .limit(20)
        )
        events = []
        for event in result.scalars().all():
            meta = dict(event.metadata_ or {})
            if meta.get("verified") is not None:
                continue
            events.append({
                "id": str(event.id),
                "title": event.title,
                "event_type": event.event_type,
                "latitude": event.latitude,
                "longitude": event.longitude,
                "created_at": event.created_at.isoformat() if event.created_at else None,
                "channel_name": meta.get("channel_name", "unknown"),
                "channel_id": meta.get("channel_id"),
            })
        return events


async def _apply_verification_results(raw_result, events_to_verify):
    """Apply CrewAI verification results back to the database."""
    from sqlalchemy import select
    from app.db.postgres import async_session
    from app.models.geo_event import GeoEvent
    from uuid import UUID

    try:
        if isinstance(raw_result, str):
            result_data = json.loads(raw_result)
        else:
            result_data = raw_result
    except (json.JSONDecodeError, TypeError):
        logger.warning("Could not parse CrewAI verification output")
        return

    results_list = result_data.get("results", [])

    async with async_session() as db:
        for vr in results_list:
            event_id = vr.get("event_id")
            if not event_id:
                continue
            try:
                res = await db.execute(
                    select(GeoEvent).where(GeoEvent.id == UUID(event_id))
                )
                event = res.scalar_one_or_none()
                if event:
                    meta = dict(event.metadata_ or {})
                    meta["verified"] = vr.get("verified", False)
                    meta["verification_confidence"] = vr.get("confidence", 0)
                    meta["verification_reasoning"] = vr.get("reasoning", "")
                    meta["verified_at"] = datetime.utcnow().isoformat()
                    event.metadata_ = meta
            except Exception as e:
                logger.debug("Could not update event %s: %s", event_id, e)

        await db.commit()


def _fallback_verify(events_to_verify):
    """Original rule-based verification pipeline — used when CrewAI is unavailable."""

    async def _run():
        from sqlalchemy import select
        from app.db.postgres import async_session
        from app.models.geo_event import GeoEvent
        from app.models.telegram_channel import TelegramChannel
        from app.models.sos_request import SosRequest
        from app.services.livemap_service import get_events_in_area
        from app.services.ai_agent.agent import verify_telegram_event
        from app.config import get_settings
        from uuid import UUID

        settings = get_settings()
        verified_count = 0
        checked_count = 0

        async with async_session() as db:
            for event_data in events_to_verify:
                checked_count += 1
                event_id = event_data["id"]
                lat = event_data.get("latitude")
                lon = event_data.get("longitude")
                channel_id = event_data.get("channel_id")

                # Load the actual event object
                res = await db.execute(
                    select(GeoEvent).where(GeoEvent.id == UUID(event_id))
                )
                event = res.scalar_one_or_none()
                if not event:
                    continue

                # Find corroborating events from other sources
                corroborating = []
                if lat and lon:
                    try:
                        nearby = await get_events_in_area(
                            db, latitude=lat, longitude=lon,
                            radius_m=3000, hours=6,
                        )
                        corroborating = [
                            e for e in nearby
                            if e.get("source") != "telegram"
                            and e.get("id") != event_id
                        ]
                    except Exception:
                        pass

                # Find related SOS requests
                related_sos = []
                if lat and lon:
                    try:
                        cutoff = datetime.utcnow() - timedelta(hours=2)
                        sos_result = await db.execute(
                            select(SosRequest)
                            .where(
                                SosRequest.created_at >= cutoff,
                                SosRequest.latitude.isnot(None),
                            )
                            .limit(20)
                        )
                        for sos in sos_result.scalars().all():
                            if sos.latitude and sos.longitude:
                                dlat = abs(sos.latitude - lat)
                                dlon = abs(sos.longitude - lon)
                                if dlat < 0.03 and dlon < 0.03:
                                    related_sos.append({
                                        "patient_status": sos.patient_status.value if sos.patient_status else None,
                                        "severity": sos.severity,
                                        "created_at": sos.created_at.isoformat() if sos.created_at else None,
                                    })
                    except Exception:
                        pass

                # AI or rule-based verification
                if settings.GLM_API_KEY:
                    verification = await verify_telegram_event(
                        event_data,
                        corroborating_events=corroborating,
                        related_sos=related_sos,
                    )
                else:
                    has_corroboration = len(corroborating) > 0 or len(related_sos) > 0
                    verification = {
                        "verified": has_corroboration,
                        "confidence": 0.7 if has_corroboration else 0.3,
                        "reasoning": "Corroborated by other sources" if has_corroboration else "No corroboration found",
                        "trust_delta": 0.05 if has_corroboration else -0.02,
                    }

                # Update event metadata
                meta = dict(event.metadata_ or {})
                meta["verified"] = verification.get("verified", False)
                meta["verification_confidence"] = verification.get("confidence", 0)
                meta["verification_reasoning"] = verification.get("reasoning", "")
                meta["verified_at"] = datetime.utcnow().isoformat()
                event.metadata_ = meta
                await db.flush()

                if verification.get("verified"):
                    verified_count += 1

                # Update channel trust score
                if channel_id:
                    trust_delta = verification.get("trust_delta", 0)
                    try:
                        ch_result = await db.execute(
                            select(TelegramChannel).where(
                                TelegramChannel.channel_id == channel_id
                            )
                        )
                        channel = ch_result.scalar_one_or_none()
                        if channel is None:
                            import uuid
                            channel = TelegramChannel(
                                id=uuid.uuid4(),
                                channel_id=channel_id,
                                channel_name=event_data.get("channel_name"),
                                trust_score=0.5,
                                total_reports=0,
                            )
                            db.add(channel)
                            await db.flush()

                        channel.total_reports = (channel.total_reports or 0) + 1
                        if verification.get("verified"):
                            channel.verified_reports = (channel.verified_reports or 0) + 1
                        elif verification.get("confidence", 0) < 0.3:
                            channel.false_reports = (channel.false_reports or 0) + 1
                        else:
                            channel.unverified_reports = (channel.unverified_reports or 0) + 1

                        new_trust = (channel.trust_score or 0.5) + trust_delta
                        channel.trust_score = max(0.0, min(1.0, new_trust))
                        channel.last_verified_at = datetime.utcnow()

                        notes = list(channel.verification_notes or [])
                        notes.append({
                            "event_id": event_id,
                            "verified": verification.get("verified"),
                            "confidence": verification.get("confidence"),
                            "trust_delta": trust_delta,
                            "at": datetime.utcnow().isoformat(),
                        })
                        channel.verification_notes = notes[-50:]

                        if channel.trust_score < 0.15 and (channel.total_reports or 0) >= 5:
                            channel.monitoring_status = "blacklisted"
                            logger.warning(
                                "Channel %s blacklisted (trust=%.2f, %d false reports)",
                                channel_id, channel.trust_score, channel.false_reports,
                            )

                        await db.flush()
                    except Exception as e:
                        logger.debug("Could not update channel trust for %s: %s", channel_id, e)

            await db.commit()

        logger.info(
            "Verification cycle complete: checked %d events, %d verified",
            checked_count, verified_count,
        )
        return {"checked": checked_count, "verified": verified_count}

    return _run_async(_run())
