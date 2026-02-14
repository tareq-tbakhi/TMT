"""
CrewAI tools — thin wrappers around existing TMT services.

Each tool is a sync function that agents can call.  Since CrewAI
runs synchronously within Celery workers, we use `_run_async()`
to bridge into the async service layer.
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Optional

from crewai.tools import tool

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from synchronous CrewAI tool context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _get_session():
    """Create a fresh async DB session."""
    from app.db.postgres import async_session
    return async_session()


# ---------------------------------------------------------------------------
# Patient tools
# ---------------------------------------------------------------------------

@tool("Query Patient")
def query_patient(patient_id: str) -> str:
    """Look up a patient by ID. Returns demographics, medical info, mobility,
    living situation, trust score, SOS history counts, and risk score."""

    async def _run():
        from app.services.patient_service import get_patient
        async with _get_session() as db:
            p = await get_patient(db, patient_id)
            if not p:
                return json.dumps({"error": "Patient not found"})
            return json.dumps({
                "id": str(p["id"]),
                "name": p.get("name"),
                "phone": p.get("phone"),
                "date_of_birth": str(p.get("date_of_birth")) if p.get("date_of_birth") else None,
                "gender": p.get("gender"),
                "mobility": p.get("mobility"),
                "living_situation": p.get("living_situation"),
                "blood_type": p.get("blood_type"),
                "chronic_conditions": p.get("chronic_conditions", []),
                "allergies": p.get("allergies", []),
                "current_medications": p.get("current_medications", []),
                "special_equipment": p.get("special_equipment", []),
                "trust_score": p.get("trust_score", 1.0),
                "false_alarm_count": p.get("false_alarm_count", 0),
                "total_sos_count": p.get("total_sos_count", 0),
                "risk_score": p.get("risk_score", 0.0),
                "risk_level": p.get("risk_level", "low"),
                "latitude": p.get("latitude"),
                "longitude": p.get("longitude"),
            }, default=str)

    return _run_async(_run())


@tool("Query Medical Records")
def query_medical_records(patient_id: str) -> str:
    """Get all medical records for a patient: conditions, medications, allergies, equipment."""

    async def _run():
        from sqlalchemy import select
        from app.models.medical_record import MedicalRecord
        from uuid import UUID

        async with _get_session() as db:
            result = await db.execute(
                select(MedicalRecord).where(MedicalRecord.patient_id == UUID(patient_id))
            )
            records = []
            for rec in result.scalars().all():
                records.append({
                    "conditions": rec.conditions or [],
                    "medications": rec.medications or [],
                    "allergies": rec.allergies or [],
                    "special_equipment": rec.special_equipment or [],
                    "notes": rec.notes,
                })
            return json.dumps(records, default=str)

    return _run_async(_run())


@tool("Query SOS History")
def query_sos_history(patient_id: str) -> str:
    """Get recent SOS requests for a patient — count, statuses, severities, patterns."""

    async def _run():
        from sqlalchemy import select, func
        from app.models.sos_request import SosRequest
        from uuid import UUID

        async with _get_session() as db:
            result = await db.execute(
                select(SosRequest)
                .where(SosRequest.patient_id == UUID(patient_id))
                .order_by(SosRequest.created_at.desc())
                .limit(20)
            )
            requests = []
            for sos in result.scalars().all():
                requests.append({
                    "id": str(sos.id),
                    "severity": sos.severity,
                    "status": sos.status.value if sos.status else None,
                    "patient_status": sos.patient_status.value if sos.patient_status else None,
                    "created_at": sos.created_at.isoformat() if sos.created_at else None,
                    "resolved_at": sos.resolved_at.isoformat() if sos.resolved_at else None,
                    "auto_resolved": getattr(sos, "auto_resolved", False),
                })
            return json.dumps({
                "total_count": len(requests),
                "recent_requests": requests,
            }, default=str)

    return _run_async(_run())


@tool("Update Risk Score")
def update_risk_score(patient_id: str, risk_score: float, risk_level: str) -> str:
    """Update a patient's persistent risk score (0-100) and risk level (low/moderate/high/critical)."""

    async def _run():
        from sqlalchemy import select
        from app.models.patient import Patient
        from uuid import UUID

        async with _get_session() as db:
            result = await db.execute(select(Patient).where(Patient.id == UUID(patient_id)))
            patient = result.scalar_one_or_none()
            if not patient:
                return json.dumps({"error": "Patient not found"})

            from app.models.patient import RiskLevel
            patient.risk_score = max(0.0, min(100.0, float(risk_score)))
            level_str = risk_level.lower() if isinstance(risk_level, str) else "low"
            level_map = {"low": RiskLevel.LOW, "moderate": RiskLevel.MODERATE,
                         "high": RiskLevel.HIGH, "critical": RiskLevel.CRITICAL}
            patient.risk_level = level_map.get(level_str, RiskLevel.LOW)
            patient.risk_updated_at = datetime.utcnow()
            await db.commit()
            return json.dumps({
                "patient_id": patient_id,
                "risk_score": patient.risk_score,
                "risk_level": patient.risk_level,
                "updated": True,
            })

    return _run_async(_run())


# ---------------------------------------------------------------------------
# Geo / Alert tools
# ---------------------------------------------------------------------------

@tool("Find Nearby Alerts")
def find_nearby_alerts(latitude: float, longitude: float, radius_m: float = 5000) -> str:
    """Find active alerts within a given radius of a location. Returns event types, severities, counts."""

    async def _run():
        from app.services.alert_service import get_alerts_near
        async with _get_session() as db:
            alerts = await get_alerts_near(
                db, latitude=latitude, longitude=longitude,
                radius_m=radius_m, limit=50,
            )
            summary = {
                "total": len(alerts),
                "alerts": [
                    {
                        "id": str(a["id"]),
                        "event_type": a.get("event_type"),
                        "severity": a.get("severity"),
                        "title": a.get("title"),
                        "source": a.get("source"),
                        "distance_m": a.get("distance_m"),
                    }
                    for a in alerts[:20]
                ],
            }
            return json.dumps(summary, default=str)

    return _run_async(_run())


@tool("Find Nearby Events")
def find_nearby_events(latitude: float, longitude: float, radius_m: float = 5000, hours: int = 24) -> str:
    """Find geo events (Telegram intel, SOS, crisis) near a location within a time window."""

    async def _run():
        from app.services.livemap_service import get_events_in_area
        async with _get_session() as db:
            events = await get_events_in_area(
                db, latitude=latitude, longitude=longitude,
                radius_m=radius_m, hours=hours, limit=50,
            )
            return json.dumps({
                "total": len(events),
                "events": [
                    {
                        "id": str(e.get("id", "")),
                        "event_type": e.get("event_type"),
                        "source": e.get("source"),
                        "severity": e.get("severity"),
                        "title": e.get("title"),
                        "layer": e.get("layer"),
                    }
                    for e in events[:20]
                ],
            }, default=str)

    return _run_async(_run())


@tool("Create Alert")
def create_alert(
    event_type: str,
    latitude: float,
    longitude: float,
    title: str,
    severity: str,
    details: str = "",
    source: str = "sos",
    confidence: float = 0.5,
    routed_department: str = "",
    target_facility_id: str = "",
    metadata_json: str = "{}",
) -> str:
    """Create an alert, broadcast to dashboards, and notify nearby patients.
    routed_department: 'hospital', 'police', or 'civil_defense' — determines which department sees this alert.
    target_facility_id: optional UUID of the specific facility to route to.
    metadata_json should be a JSON string with extra fields like sos_id, patient_info, etc."""

    async def _run():
        from app.services.alert_service import create_alert as _create
        async with _get_session() as db:
            try:
                meta = json.loads(metadata_json)
            except (json.JSONDecodeError, TypeError):
                meta = {}
            alert = await _create(
                db,
                event_type=event_type,
                latitude=latitude,
                longitude=longitude,
                title=title,
                radius_m=500,
                details=details,
                source=source,
                confidence=confidence,
                severity_override=severity,
                metadata=meta,
                routed_department=routed_department if routed_department else None,
                target_facility_id=target_facility_id if target_facility_id else None,
                broadcast=True,
                notify_patients=True,
            )
            await db.commit()
            return json.dumps({
                "alert_id": str(alert.get("id", "")),
                "event_type": alert.get("event_type"),
                "severity": alert.get("severity"),
                "title": alert.get("title"),
                "routed_department": alert.get("routed_department"),
                "created": True,
            }, default=str)

    return _run_async(_run())


@tool("Find Nearby Hospitals")
def find_nearby_hospitals(latitude: float, longitude: float) -> str:
    """Find hospitals near a location with their status, bed availability,
    specialties, supply levels, and approximate distance. Use this to
    recommend the best hospital for a patient."""

    return find_nearby_facilities(latitude=latitude, longitude=longitude, department_type="hospital")


@tool("Find Nearby Facilities")
def find_nearby_facilities(latitude: float, longitude: float, department_type: str = "") -> str:
    """Find facilities (hospitals, police stations, or civil defense centers) near a location.
    Set department_type to 'hospital', 'police', or 'civil_defense' to filter.
    Leave empty to return all facility types.
    Returns status, capacity, distance, and department-specific fields."""

    async def _run():
        from app.services.hospital_service import find_nearest_hospitals as _find
        async with _get_session() as db:
            facilities = await _find(
                db, latitude=latitude, longitude=longitude,
                department_type=department_type if department_type else None,
                limit=10,
            )
            return json.dumps(facilities[:10], default=str)

    return _run_async(_run())


# ---------------------------------------------------------------------------
# Telegram / Intel tools
# ---------------------------------------------------------------------------

@tool("Search Telegram Intel")
def search_telegram_intel(query: str, limit: int = 10) -> str:
    """Semantic search of Telegram intelligence in the Qdrant knowledge base."""

    async def _run():
        from app.services.ai_agent.embeddings import search_similar
        results = await search_similar(query, limit=limit)
        return json.dumps(results[:limit], default=str)

    return _run_async(_run())


@tool("Fetch Telegram Messages")
def fetch_telegram_messages(limit_per_channel: int = 20) -> str:
    """Fetch recent messages from all monitored Telegram channels."""

    async def _run():
        from app.telegram.channel_manager import fetch_recent_messages
        messages = await fetch_recent_messages(limit_per_channel=limit_per_channel)
        return json.dumps([
            {
                "text": m.get("text", "")[:500],
                "channel": m.get("channel_name"),
                "channel_id": m.get("channel_id"),
                "date": m.get("date"),
            }
            for m in messages
        ], default=str)

    return _run_async(_run())


@tool("Classify Message")
def classify_and_extract_message(message_text: str, channel_name: str = "unknown") -> str:
    """Classify a Telegram message as crisis/non-crisis and extract structured data if crisis."""

    async def _run():
        from app.telegram.message_processor import process_message
        result = await process_message({
            "text": message_text,
            "channel_name": channel_name,
        })
        if result:
            return json.dumps(result, default=str)
        return json.dumps({"is_crisis": False, "processed": True})

    return _run_async(_run())


@tool("Store Embedding")
def store_embedding_tool(text: str, source: str = "telegram", event_type: str = "", is_crisis: bool = False) -> str:
    """Generate and store a text embedding in the Qdrant knowledge base."""

    async def _run():
        from app.services.ai_agent.embeddings import generate_embedding, store_embedding
        embedding = await generate_embedding(text)
        if embedding:
            point_id = await store_embedding(text, embedding, metadata={
                "source": source,
                "event_type": event_type,
                "is_crisis": is_crisis,
                "date": datetime.utcnow().isoformat(),
            })
            return json.dumps({"stored": True, "point_id": point_id})
        return json.dumps({"stored": False, "reason": "embedding generation failed"})

    return _run_async(_run())


# ---------------------------------------------------------------------------
# Verification tools
# ---------------------------------------------------------------------------

@tool("Find Corroboration")
def find_corroboration(latitude: float, longitude: float, hours: int = 6) -> str:
    """Find corroborating events from non-Telegram sources near a location."""

    async def _run():
        from app.services.livemap_service import get_events_in_area
        async with _get_session() as db:
            events = await get_events_in_area(
                db, latitude=latitude, longitude=longitude,
                radius_m=3000, hours=hours, limit=50,
            )
            corroborating = [
                {
                    "id": str(e.get("id", "")),
                    "source": e.get("source"),
                    "event_type": e.get("event_type"),
                    "title": e.get("title"),
                    "severity": e.get("severity"),
                }
                for e in events
                if e.get("source") not in ("telegram", "telegram_intel")
            ]
            return json.dumps({
                "total": len(corroborating),
                "events": corroborating[:20],
            }, default=str)

    return _run_async(_run())


@tool("Find Related SOS")
def find_related_sos(latitude: float, longitude: float, hours: int = 2) -> str:
    """Find SOS requests from patients near a location within a time window."""

    async def _run():
        from sqlalchemy import select
        from datetime import timedelta
        from app.models.sos_request import SosRequest

        cutoff = datetime.utcnow() - timedelta(hours=hours)
        async with _get_session() as db:
            result = await db.execute(
                select(SosRequest)
                .where(
                    SosRequest.created_at >= cutoff,
                    SosRequest.latitude.isnot(None),
                )
                .limit(50)
            )
            related = []
            for sos in result.scalars().all():
                if sos.latitude and sos.longitude:
                    dlat = abs(sos.latitude - latitude)
                    dlon = abs(sos.longitude - longitude)
                    if dlat < 0.03 and dlon < 0.03:
                        related.append({
                            "severity": sos.severity,
                            "patient_status": sos.patient_status.value if sos.patient_status else None,
                            "created_at": sos.created_at.isoformat() if sos.created_at else None,
                        })
            return json.dumps({"total": len(related), "sos_requests": related}, default=str)

    return _run_async(_run())


@tool("Update Channel Trust")
def update_channel_trust(channel_id: str, trust_delta: float, verified: bool, confidence: float = 0.5) -> str:
    """Update a Telegram channel's trust score based on verification results."""

    async def _run():
        import uuid as _uuid
        from sqlalchemy import select
        from app.models.telegram_channel import TelegramChannel

        async with _get_session() as db:
            result = await db.execute(
                select(TelegramChannel).where(TelegramChannel.channel_id == channel_id)
            )
            channel = result.scalar_one_or_none()
            if channel is None:
                channel = TelegramChannel(
                    id=_uuid.uuid4(),
                    channel_id=channel_id,
                    trust_score=0.5,
                    total_reports=0,
                )
                db.add(channel)
                await db.flush()

            channel.total_reports = (channel.total_reports or 0) + 1
            if verified:
                channel.verified_reports = (channel.verified_reports or 0) + 1
            elif confidence < 0.3:
                channel.false_reports = (channel.false_reports or 0) + 1
            else:
                channel.unverified_reports = (channel.unverified_reports or 0) + 1

            new_trust = (channel.trust_score or 0.5) + trust_delta
            channel.trust_score = max(0.0, min(1.0, new_trust))
            channel.last_verified_at = datetime.utcnow()

            blacklisted = False
            if channel.trust_score < 0.15 and (channel.total_reports or 0) >= 5:
                channel.monitoring_status = "blacklisted"
                blacklisted = True

            await db.commit()
            return json.dumps({
                "channel_id": channel_id,
                "trust_score": channel.trust_score,
                "blacklisted": blacklisted,
                "updated": True,
            })

    return _run_async(_run())
