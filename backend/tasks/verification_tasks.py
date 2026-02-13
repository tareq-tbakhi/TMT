"""Celery tasks for Telegram channel trust verification.

Runs periodically to:
1. Find unverified Telegram-sourced events from the last few hours
2. Cross-reference with SOS requests, other alerts, and multi-source corroboration
3. Use AI to verify each event
4. Update channel trust scores based on verification results
"""
import asyncio
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


@celery_app.task(name="tasks.verification_tasks.verify_recent_telegram_events")
def verify_recent_telegram_events():
    """
    Verify recent Telegram-sourced events by cross-referencing with:
    - Other geo events in the same area from different sources
    - SOS requests from patients in the same area
    - Time-based decay (old events with no corroboration become less trusted)

    Updates channel trust scores accordingly.
    """
    logger.info("Starting Telegram event verification cycle")

    async def _run():
        from sqlalchemy import select, and_
        from app.db.postgres import async_session
        from app.models.geo_event import GeoEvent
        from app.models.telegram_channel import TelegramChannel
        from app.services.livemap_service import get_events_in_area
        from app.services.ai_agent.agent import verify_telegram_event
        from app.config import get_settings

        settings = get_settings()
        verified_count = 0
        checked_count = 0

        async with async_session() as db:
            # Find Telegram-sourced events from last 6 hours that haven't been verified
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
            telegram_events = result.scalars().all()

            for event in telegram_events:
                meta = dict(event.metadata_ or {})

                # Skip already verified events
                if meta.get("verified") is not None:
                    continue

                checked_count += 1
                event_data = {
                    "title": event.title,
                    "event_type": event.event_type,
                    "latitude": event.latitude,
                    "longitude": event.longitude,
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                    "channel_name": meta.get("channel_name", "unknown"),
                    "channel_id": meta.get("channel_id"),
                }

                # Find corroborating events from other sources in same area
                corroborating = []
                if event.latitude and event.longitude:
                    try:
                        nearby = await get_events_in_area(
                            db,
                            latitude=event.latitude,
                            longitude=event.longitude,
                            radius_m=3000,
                            hours=6,
                        )
                        corroborating = [
                            e for e in nearby
                            if e.get("source") != "telegram"
                            and e.get("id") != str(event.id)
                        ]
                    except Exception:
                        pass

                # Find related SOS requests
                related_sos = []
                if event.latitude and event.longitude:
                    try:
                        from app.models.sos_request import SosRequest
                        sos_cutoff = event.created_at - timedelta(hours=2) if event.created_at else cutoff
                        sos_result = await db.execute(
                            select(SosRequest)
                            .where(
                                SosRequest.created_at >= sos_cutoff,
                                SosRequest.latitude.isnot(None),
                            )
                            .limit(20)
                        )
                        for sos in sos_result.scalars().all():
                            if sos.latitude and sos.longitude:
                                # Simple distance check (~3km)
                                dlat = abs(sos.latitude - event.latitude)
                                dlon = abs(sos.longitude - event.longitude)
                                if dlat < 0.03 and dlon < 0.03:
                                    related_sos.append({
                                        "patient_status": sos.patient_status.value if sos.patient_status else None,
                                        "severity": sos.severity,
                                        "created_at": sos.created_at.isoformat() if sos.created_at else None,
                                    })
                    except Exception:
                        pass

                # AI verification
                if settings.GLM_API_KEY:
                    verification = await verify_telegram_event(
                        event_data,
                        corroborating_events=corroborating,
                        related_sos=related_sos,
                    )
                else:
                    # Rule-based verification: corroborated if other sources confirm
                    has_corroboration = len(corroborating) > 0 or len(related_sos) > 0
                    verification = {
                        "verified": has_corroboration,
                        "confidence": 0.7 if has_corroboration else 0.3,
                        "reasoning": "Corroborated by other sources" if has_corroboration else "No corroboration found",
                        "trust_delta": 0.05 if has_corroboration else -0.02,
                    }

                # Update event metadata with verification result
                meta["verified"] = verification.get("verified", False)
                meta["verification_confidence"] = verification.get("confidence", 0)
                meta["verification_reasoning"] = verification.get("reasoning", "")
                meta["verified_at"] = datetime.utcnow().isoformat()
                event.metadata_ = meta
                await db.flush()

                if verification.get("verified"):
                    verified_count += 1

                # Update channel trust score
                channel_id = meta.get("channel_id")
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
                            # Create channel record
                            import uuid
                            channel = TelegramChannel(
                                id=uuid.uuid4(),
                                channel_id=channel_id,
                                channel_name=meta.get("channel_name"),
                                trust_score=0.5,
                                total_reports=0,
                            )
                            db.add(channel)
                            await db.flush()

                        channel.total_reports = (channel.total_reports or 0) + 1
                        if verification.get("verified"):
                            channel.verified_reports = (channel.verified_reports or 0) + 1
                        else:
                            if verification.get("confidence", 0) < 0.3:
                                channel.false_reports = (channel.false_reports or 0) + 1
                            else:
                                channel.unverified_reports = (channel.unverified_reports or 0) + 1

                        # Adjust trust score
                        new_trust = (channel.trust_score or 0.5) + trust_delta
                        channel.trust_score = max(0.0, min(1.0, new_trust))
                        channel.last_verified_at = datetime.utcnow()

                        # Append verification note
                        notes = list(channel.verification_notes or [])
                        notes.append({
                            "event_id": str(event.id),
                            "verified": verification.get("verified"),
                            "confidence": verification.get("confidence"),
                            "trust_delta": trust_delta,
                            "at": datetime.utcnow().isoformat(),
                        })
                        # Keep last 50 notes
                        channel.verification_notes = notes[-50:]

                        # Auto-blacklist channels with very low trust
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
