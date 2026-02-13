#!/usr/bin/env python3
"""
Deep Agent Test Suite — Comprehensive CrewAI Multi-Agent Testing

Tests the SOS Triage Crew (Risk Scorer + Triage Agent) with diverse scenarios:
- Positive: High-risk patients who should get critical alerts
- Negative: Low-risk patients, false alarms
- Edge cases: Hospital down, no location, wheelchair+alone, etc.

Outputs a formatted report with timing, decisions, and pass/fail.
"""
import asyncio
import json
import logging
import sys
import time
import uuid
from datetime import datetime, date, timedelta

# Add parent to path
sys.path.insert(0, "/app")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("agent_test")


# ──────────────────────────────────────────────────────────────────────
# Test patient profiles
# ──────────────────────────────────────────────────────────────────────

TEST_PATIENTS = [
    {
        "id": "test-patient-01",
        "name": "Fatima Al-Masri (Bedridden, Alone, Diabetic)",
        "phone": "0599900001",
        "mobility": "bedridden",
        "living_situation": "alone",
        "blood_type": "O-",
        "date_of_birth": "1945-03-15",  # 80+ years old
        "chronic_conditions": ["diabetes_type2", "hypertension", "heart_disease"],
        "allergies": ["penicillin", "aspirin"],
        "current_medications": ["metformin_500mg", "lisinopril_10mg", "insulin"],
        "special_equipment": ["oxygen_tank", "glucose_monitor"],
        "trust_score": 0.95,
        "false_alarm_count": 0,
        "total_sos_count": 3,
        "latitude": 31.5150,
        "longitude": 34.4400,
    },
    {
        "id": "test-patient-02",
        "name": "Omar Hassan (Healthy, With Family)",
        "phone": "0599900002",
        "mobility": "can_walk",
        "living_situation": "with_family",
        "blood_type": "A+",
        "date_of_birth": "1990-07-20",  # 35 years old
        "chronic_conditions": [],
        "allergies": [],
        "current_medications": [],
        "special_equipment": [],
        "trust_score": 1.0,
        "false_alarm_count": 0,
        "total_sos_count": 0,
        "latitude": 31.5200,
        "longitude": 34.4350,
    },
    {
        "id": "test-patient-03",
        "name": "Yusuf Qassem (Wheelchair, Alone, Asthmatic)",
        "phone": "0599900003",
        "mobility": "wheelchair",
        "living_situation": "alone",
        "blood_type": "B+",
        "date_of_birth": "1958-11-02",  # 67 years old
        "chronic_conditions": ["asthma", "chronic_kidney_disease"],
        "allergies": ["sulfa_drugs", "shellfish"],
        "current_medications": ["albuterol_inhaler", "prednisone"],
        "special_equipment": ["wheelchair", "nebulizer"],
        "trust_score": 0.85,
        "false_alarm_count": 1,
        "total_sos_count": 5,
        "latitude": 31.3250,
        "longitude": 34.3100,
    },
    {
        "id": "test-patient-04",
        "name": "Nour Khalidi (Frequent False Alarms)",
        "phone": "0599900004",
        "mobility": "can_walk",
        "living_situation": "with_family",
        "blood_type": "AB+",
        "date_of_birth": "1985-04-10",
        "chronic_conditions": ["anxiety"],
        "allergies": [],
        "current_medications": ["sertraline_50mg"],
        "special_equipment": [],
        "trust_score": 0.3,
        "false_alarm_count": 8,
        "total_sos_count": 12,
        "latitude": 31.5180,
        "longitude": 34.4420,
    },
    {
        "id": "test-patient-05",
        "name": "Layla Ibrahim (Child, Care Facility)",
        "phone": "0599900005",
        "mobility": "can_walk",
        "living_situation": "care_facility",
        "blood_type": "O+",
        "date_of_birth": "2018-09-25",  # 7 years old
        "chronic_conditions": ["epilepsy", "cerebral_palsy"],
        "allergies": ["latex", "eggs"],
        "current_medications": ["valproic_acid", "levetiracetam"],
        "special_equipment": ["seizure_alert_device"],
        "trust_score": 1.0,
        "false_alarm_count": 0,
        "total_sos_count": 2,
        "latitude": 31.5100,
        "longitude": 34.4500,
    },
    {
        "id": "test-patient-06",
        "name": "Ibrahim Saleh (Pregnant, Alone)",
        "phone": "0599900006",
        "mobility": "other",
        "living_situation": "alone",
        "blood_type": "A-",
        "date_of_birth": "1995-01-12",
        "chronic_conditions": ["gestational_diabetes", "high_risk_pregnancy"],
        "allergies": ["ibuprofen"],
        "current_medications": ["prenatal_vitamins", "insulin"],
        "special_equipment": [],
        "trust_score": 1.0,
        "false_alarm_count": 0,
        "total_sos_count": 1,
        "latitude": 31.5050,
        "longitude": 34.4450,
    },
]

# ──────────────────────────────────────────────────────────────────────
# SOS test scenarios
# ──────────────────────────────────────────────────────────────────────

TEST_SCENARIOS = [
    # --- POSITIVE: Should get HIGH/CRITICAL alerts ---
    {
        "name": "P1: Bedridden elderly diabetic — bombing nearby",
        "patient_idx": 0,
        "severity": 5,
        "patient_status": "trapped",
        "message": "Bombing hit nearby building. I'm trapped in my room, can't move. Need oxygen supply running low.",
        "expected_severity": "critical",
        "expected_urgency": "immediate",
        "category": "POSITIVE",
    },
    {
        "name": "P2: Wheelchair patient near LIMITED hospital — building collapse",
        "patient_idx": 2,
        "severity": 4,
        "patient_status": "trapped",
        "message": "Building partially collapsed. I'm in wheelchair, can't get out. Dust making it hard to breathe with my asthma.",
        "expected_severity": "critical",
        "expected_urgency": "immediate",
        "category": "POSITIVE",
    },
    {
        "name": "P3: Child with epilepsy — medical emergency",
        "patient_idx": 4,
        "severity": 4,
        "patient_status": "injured",
        "message": "Child having prolonged seizure, not stopping after 5 minutes. Need emergency medication.",
        "expected_severity": "high",
        "expected_urgency": "immediate",
        "category": "POSITIVE",
    },
    {
        "name": "P4: Pregnant woman alone — medical emergency",
        "patient_idx": 5,
        "severity": 4,
        "patient_status": "injured",
        "message": "Heavy bleeding, 8 months pregnant. I'm alone at home and feeling dizzy. Gestational diabetes complicating things.",
        "expected_severity": "critical",
        "expected_urgency": "immediate",
        "category": "POSITIVE",
    },

    # --- NEGATIVE: Lower priority, should not be CRITICAL ---
    {
        "name": "N1: Healthy young man — minor injury",
        "patient_idx": 1,
        "severity": 1,
        "patient_status": "injured",
        "message": "Small cut on my hand from broken glass. Not deep, just need bandage.",
        "expected_severity": "low",
        "expected_urgency": "when_available",
        "category": "NEGATIVE",
    },
    {
        "name": "N2: False alarm — frequent caller low trust",
        "patient_idx": 3,
        "severity": 2,
        "patient_status": "safe",
        "message": "I think I heard something outside. Feeling scared.",
        "expected_severity": "low",
        "expected_urgency": "when_available",
        "category": "NEGATIVE",
    },

    # --- EDGE CASES ---
    {
        "name": "E1: Bedridden alone — evacuation needed, no specific details",
        "patient_idx": 0,
        "severity": 3,
        "patient_status": "evacuate",
        "message": "Told to evacuate but I can't move. Need help getting out.",
        "expected_severity": "high",
        "expected_urgency": "immediate",
        "category": "EDGE",
    },
    {
        "name": "E2: Wheelchair asthmatic — fire, near LIMITED hospital",
        "patient_idx": 2,
        "severity": 5,
        "patient_status": "trapped",
        "message": "Fire in the building. Smoke everywhere. I can barely breathe. Wheelchair stuck.",
        "expected_severity": "critical",
        "expected_urgency": "immediate",
        "category": "EDGE",
    },
    {
        "name": "E3: Healthy person — severity 5 max urgency no medical history",
        "patient_idx": 1,
        "severity": 5,
        "patient_status": "trapped",
        "message": "Massive building collapse. I'm trapped under rubble. Can hear others screaming.",
        "expected_severity": "critical",
        "expected_urgency": "immediate",
        "category": "EDGE",
    },
    {
        "name": "E4: Low-trust caller — but severity 5 genuine emergency",
        "patient_idx": 3,
        "severity": 5,
        "patient_status": "injured",
        "message": "I know I've called before but this is real. Shooting in the street. I'm hit in the leg.",
        "expected_severity": "high",
        "expected_urgency": "immediate",
        "category": "EDGE",
    },
]


# ──────────────────────────────────────────────────────────────────────
# Database setup helpers
# ──────────────────────────────────────────────────────────────────────

async def setup_test_patients():
    """Seed test patients into the database with rich medical data."""
    from sqlalchemy import select, text
    from app.db.postgres import async_session
    from app.models.patient import Patient, MobilityStatus, LivingSituation

    mobility_map = {
        "can_walk": MobilityStatus.CAN_WALK,
        "wheelchair": MobilityStatus.WHEELCHAIR,
        "bedridden": MobilityStatus.BEDRIDDEN,
        "other": MobilityStatus.OTHER,
    }
    living_map = {
        "alone": LivingSituation.ALONE,
        "with_family": LivingSituation.WITH_FAMILY,
        "care_facility": LivingSituation.CARE_FACILITY,
    }

    created_ids = []
    async with async_session() as db:
        for tp in TEST_PATIENTS:
            # Check if already exists
            result = await db.execute(
                select(Patient).where(Patient.phone == tp["phone"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                # Update with rich data
                existing.name = tp["name"]
                existing.mobility = mobility_map[tp["mobility"]]
                existing.living_situation = living_map[tp["living_situation"]]
                existing.blood_type = tp["blood_type"]
                existing.date_of_birth = date.fromisoformat(tp["date_of_birth"]) if tp.get("date_of_birth") else None
                existing.chronic_conditions = tp["chronic_conditions"]
                existing.allergies = tp["allergies"]
                existing.current_medications = tp["current_medications"]
                existing.special_equipment = tp["special_equipment"]
                existing.trust_score = tp["trust_score"]
                existing.false_alarm_count = tp["false_alarm_count"]
                existing.total_sos_count = tp["total_sos_count"]
                existing.latitude = tp["latitude"]
                existing.longitude = tp["longitude"]
                created_ids.append(str(existing.id))
                logger.info("Updated patient: %s (%s)", tp["name"], existing.id)
            else:
                pid = uuid.uuid4()
                patient = Patient(
                    id=pid,
                    phone=tp["phone"],
                    name=tp["name"],
                    mobility=mobility_map[tp["mobility"]],
                    living_situation=living_map[tp["living_situation"]],
                    blood_type=tp["blood_type"],
                    date_of_birth=date.fromisoformat(tp["date_of_birth"]) if tp.get("date_of_birth") else None,
                    chronic_conditions=tp["chronic_conditions"],
                    allergies=tp["allergies"],
                    current_medications=tp["current_medications"],
                    special_equipment=tp["special_equipment"],
                    trust_score=tp["trust_score"],
                    false_alarm_count=tp["false_alarm_count"],
                    total_sos_count=tp["total_sos_count"],
                    latitude=tp["latitude"],
                    longitude=tp["longitude"],
                    is_active=True,
                )
                db.add(patient)
                created_ids.append(str(pid))
                logger.info("Created patient: %s (%s)", tp["name"], pid)

        await db.commit()
    return created_ids


async def get_patient_id_by_phone(phone):
    """Look up patient ID by phone."""
    from sqlalchemy import select
    from app.db.postgres import async_session
    from app.models.patient import Patient

    async with async_session() as db:
        result = await db.execute(
            select(Patient).where(Patient.phone == phone)
        )
        p = result.scalar_one_or_none()
        return str(p.id) if p else None


async def get_patient_risk(patient_id):
    """Get patient's risk score after agent processing."""
    from sqlalchemy import select
    from app.db.postgres import async_session
    from app.models.patient import Patient
    from uuid import UUID

    async with async_session() as db:
        result = await db.execute(
            select(Patient).where(Patient.id == UUID(patient_id))
        )
        p = result.scalar_one_or_none()
        if p:
            return {
                "risk_score": p.risk_score,
                "risk_level": str(p.risk_level) if p.risk_level else None,
                "risk_updated_at": p.risk_updated_at.isoformat() if p.risk_updated_at else None,
            }
        return None


async def count_alerts_since(since: datetime):
    """Count alerts created after a timestamp."""
    from sqlalchemy import select, func
    from app.db.postgres import async_session
    from app.models.alert import Alert

    async with async_session() as db:
        result = await db.execute(
            select(Alert).where(Alert.created_at >= since).order_by(Alert.created_at.desc())
        )
        alerts = result.scalars().all()
        return [
            {
                "id": str(a.id),
                "event_type": a.event_type,
                "severity": a.severity,
                "title": a.title,
                "source": a.source,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "metadata": dict(a.metadata_ or {}),
            }
            for a in alerts
        ]


# ──────────────────────────────────────────────────────────────────────
# Run a single SOS scenario
# ──────────────────────────────────────────────────────────────────────

async def run_scenario(scenario, patient_ids):
    """Run one SOS scenario through the triage crew and collect results."""
    import traceback
    patient_data = TEST_PATIENTS[scenario["patient_idx"]]
    patient_id = patient_ids[scenario["patient_idx"]]

    sos_payload = {
        "id": str(uuid.uuid4()),
        "patient_id": patient_id,
        "latitude": patient_data["latitude"],
        "longitude": patient_data["longitude"],
        "severity": scenario["severity"],
        "patient_status": scenario["patient_status"],
        "message": scenario.get("message", ""),
        "details": scenario.get("message", ""),
        "patient_info": {
            "name": patient_data["name"],
            "phone": patient_data["phone"],
            "blood_type": patient_data["blood_type"],
            "mobility": patient_data["mobility"],
            "living_situation": patient_data["living_situation"],
            "chronic_conditions": patient_data["chronic_conditions"],
            "allergies": patient_data["allergies"],
            "current_medications": patient_data["current_medications"],
            "special_equipment": patient_data["special_equipment"],
            "trust_score": patient_data["trust_score"],
            "total_sos_count": patient_data["total_sos_count"],
            "false_alarm_count": patient_data["false_alarm_count"],
            "date_of_birth": patient_data.get("date_of_birth"),
        },
    }

    alert_before = datetime.utcnow()
    start_time = time.time()
    used_crewai = False
    result = None

    # Try CrewAI crew directly (not through Celery)
    try:
        from app.services.ai_agent.crews import build_triage_crew
        from app.config import get_settings

        settings = get_settings()
        if not settings.GLM_API_KEY:
            raise RuntimeError("No LLM API key")

        crew = build_triage_crew()
        crew_result = crew.kickoff(inputs={
            "patient_id": str(patient_id),
            "latitude": sos_payload["latitude"],
            "longitude": sos_payload["longitude"],
            "severity": sos_payload["severity"],
            "message": sos_payload.get("message", ""),
            "patient_status": sos_payload.get("patient_status", "unknown"),
            "sos_id": sos_payload["id"],
            "patient_info": json.dumps(sos_payload.get("patient_info", {}), default=str),
        })
        result = crew_result.raw
        used_crewai = True
        logger.info("CrewAI result: %s", str(result)[:200])
    except Exception as e:
        logger.warning("CrewAI failed: %s\n%s", e, traceback.format_exc())

    # Fallback: rule-based triage
    if result is None:
        try:
            from tasks.sos_tasks import _fallback_triage
            # Run fallback in a thread to avoid event loop conflicts
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = await asyncio.get_event_loop().run_in_executor(
                    pool, _fallback_triage, sos_payload
                )
        except Exception as e:
            logger.warning("Fallback also failed: %s\n%s", e, traceback.format_exc())
            result = {"error": str(e)}

    elapsed = time.time() - start_time

    # Check patient risk score after processing
    risk_after = await get_patient_risk(patient_id)

    # Check for new alerts
    new_alerts = await count_alerts_since(alert_before)

    return {
        "scenario": scenario["name"],
        "category": scenario["category"],
        "patient": patient_data["name"],
        "sos_severity": scenario["severity"],
        "patient_status": scenario["patient_status"],
        "message": scenario.get("message", "")[:80],
        "expected_severity": scenario["expected_severity"],
        "expected_urgency": scenario["expected_urgency"],
        "elapsed_seconds": round(elapsed, 2),
        "agent_result": result,
        "risk_after": risk_after,
        "new_alerts": new_alerts,
        "used_crewai": used_crewai,
    }


# ──────────────────────────────────────────────────────────────────────
# Report generation
# ──────────────────────────────────────────────────────────────────────

def print_report(results):
    """Print a formatted test report."""
    print("\n" + "=" * 100)
    print("  CREWAI MULTI-AGENT DEEP TEST REPORT")
    print("  " + datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    print("=" * 100)

    total_time = sum(r["elapsed_seconds"] for r in results)
    categories = {"POSITIVE": [], "NEGATIVE": [], "EDGE": []}
    for r in results:
        categories[r["category"]].append(r)

    print(f"\n  Total scenarios: {len(results)}")
    print(f"  Total time: {total_time:.1f}s")
    print(f"  Average per scenario: {total_time / len(results):.1f}s")

    for cat_name, cat_results in categories.items():
        print(f"\n{'─' * 100}")
        print(f"  {cat_name} CASES ({len(cat_results)} scenarios)")
        print(f"{'─' * 100}")

        for r in cat_results:
            # Determine actual severity from agent result
            actual_severity = "unknown"
            actual_urgency = "unknown"
            actual_risk_score = "N/A"
            actual_risk_level = "N/A"
            recommended_hospital = "N/A"
            alert_created = False
            used_crewai = False

            if r["risk_after"]:
                actual_risk_score = r["risk_after"].get("risk_score", "N/A")
                actual_risk_level = r["risk_after"].get("risk_level", "N/A")

            if r["new_alerts"]:
                alert = r["new_alerts"][0]
                actual_severity = alert.get("severity", "unknown")
                alert_created = True
                meta = alert.get("metadata", {})
                actual_urgency = meta.get("response_urgency", "unknown")
                recommended_hospital = meta.get("recommended_hospital", "N/A")
                if meta.get("ai_classified") is not False:
                    used_crewai = True

            agent_raw = r["agent_result"]
            if isinstance(agent_raw, str):
                try:
                    agent_raw = json.loads(agent_raw)
                except (json.JSONDecodeError, TypeError):
                    pass

            used_crewai = r.get("used_crewai", False)

            # Check if result looks like it created an alert
            if isinstance(agent_raw, dict) and agent_raw.get("id"):
                alert_created = True

            # Determine pass/fail
            sev_ok = "?"
            if actual_severity != "unknown":
                if r["category"] == "NEGATIVE":
                    sev_ok = "PASS" if actual_severity.lower() in ("low", "medium") else "FAIL"
                elif r["expected_severity"] == "critical":
                    sev_ok = "PASS" if actual_severity.lower() in ("critical", "high") else "FAIL"
                elif r["expected_severity"] == "high":
                    sev_ok = "PASS" if actual_severity.lower() in ("high", "critical") else "FAIL"
                else:
                    sev_ok = "PASS" if actual_severity.lower() == r["expected_severity"] else "~"

            engine_label = "CrewAI" if used_crewai else "Fallback"

            print(f"\n  [{r['category']}] {r['scenario']}")
            print(f"  {'─' * 90}")
            print(f"  Patient:    {r['patient']}")
            print(f"  SOS:        severity={r['sos_severity']}/5, status={r['patient_status']}")
            print(f"  Message:    \"{r['message']}...\"")
            print(f"  Engine:     {engine_label}")
            print(f"  Time:       {r['elapsed_seconds']:.1f}s")
            print(f"  Risk Score: {actual_risk_score} (level: {actual_risk_level})")
            print(f"  Alert:      {'Created' if alert_created else 'NOT created'} | Severity: {actual_severity}")
            print(f"  Expected:   severity={r['expected_severity']}, urgency={r['expected_urgency']}")
            print(f"  Hospital:   {recommended_hospital}")
            print(f"  Verdict:    {sev_ok}")

            # Show raw agent output (truncated)
            raw_str = json.dumps(agent_raw, default=str)[:300] if isinstance(agent_raw, dict) else str(agent_raw)[:300]
            print(f"  Raw Output: {raw_str}")

    # Summary table
    print(f"\n{'=' * 100}")
    print("  SUMMARY TABLE")
    print(f"{'=' * 100}")
    print(f"  {'Scenario':<55} {'Time':>6} {'Risk':>6} {'Severity':>10} {'Alert':>7} {'Verdict':>8}")
    print(f"  {'─' * 55} {'─' * 6} {'─' * 6} {'─' * 10} {'─' * 7} {'─' * 8}")

    for r in results:
        actual_severity = "?"
        alert_created = "No"
        risk = "?"
        verdict = "?"

        if r["risk_after"]:
            risk = str(r["risk_after"].get("risk_score", "?"))

        if r["new_alerts"]:
            alert_created = "Yes"
            actual_severity = r["new_alerts"][0].get("severity", "?")

        agent_raw = r["agent_result"]
        if isinstance(agent_raw, dict) and agent_raw.get("id"):
            alert_created = "Yes"

        if actual_severity != "?":
            if r["category"] == "NEGATIVE":
                verdict = "PASS" if actual_severity.lower() in ("low", "medium") else "FAIL"
            elif r["expected_severity"] in ("critical", "high"):
                verdict = "PASS" if actual_severity.lower() in ("critical", "high") else "FAIL"
            else:
                verdict = "PASS" if actual_severity.lower() == r["expected_severity"] else "~"

        name_short = r["scenario"][:55]
        print(f"  {name_short:<55} {r['elapsed_seconds']:>5.1f}s {risk:>6} {actual_severity:>10} {alert_created:>7} {verdict:>8}")

    print(f"\n{'=' * 100}")
    print(f"  Total: {len(results)} scenarios | Time: {total_time:.1f}s | Avg: {total_time/len(results):.1f}s/scenario")
    pass_count = sum(1 for r in results if "PASS" in str(r))
    print(f"{'=' * 100}\n")


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

async def main():
    print("\n[1/3] Setting up test patients with rich medical data...")
    patient_ids = await setup_test_patients()
    print(f"  -> {len(patient_ids)} test patients ready")

    # Map patient_ids correctly
    final_ids = []
    for tp in TEST_PATIENTS:
        pid = await get_patient_id_by_phone(tp["phone"])
        final_ids.append(pid)
        print(f"  {tp['name'][:40]}: {pid}")

    print(f"\n[2/3] Running {len(TEST_SCENARIOS)} test scenarios...")
    print("  (Adding 5s delay between scenarios to avoid API rate limits)")
    results = []
    for i, scenario in enumerate(TEST_SCENARIOS):
        if i > 0:
            print(f"  ... waiting 5s (rate limit cooldown)")
            await asyncio.sleep(5)
        print(f"\n  [{i+1}/{len(TEST_SCENARIOS)}] {scenario['name']}")
        try:
            result = await run_scenario(scenario, final_ids)
            results.append(result)
            print(f"  -> Done in {result['elapsed_seconds']:.1f}s | CrewAI={result.get('used_crewai', False)}")
        except Exception as e:
            logger.exception("Scenario failed: %s", e)
            results.append({
                "scenario": scenario["name"],
                "category": scenario["category"],
                "patient": TEST_PATIENTS[scenario["patient_idx"]]["name"],
                "sos_severity": scenario["severity"],
                "patient_status": scenario["patient_status"],
                "message": scenario.get("message", "")[:80],
                "expected_severity": scenario["expected_severity"],
                "expected_urgency": scenario["expected_urgency"],
                "elapsed_seconds": 0,
                "agent_result": {"error": str(e)},
                "risk_after": None,
                "new_alerts": [],
                "used_crewai": False,
            })

    print(f"\n[3/3] Generating report...")
    print_report(results)


if __name__ == "__main__":
    asyncio.run(main())
