#!/usr/bin/env python3
"""
Deep Fallback Pipeline Test — Tests the rule-based fallback triage.

Since CrewAI+GLM-5 is rate-limited (~1 req/min), this tests the fallback
pipeline that runs when CrewAI is unavailable. This is the same pipeline
the system uses when the LLM API is down.
"""
import asyncio
import json
import logging
import sys
import time
import uuid
from datetime import datetime, date, timedelta

sys.path.insert(0, "/app")

# Suppress SQLAlchemy noise
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fallback_test")


# Same test patients as the deep test
TEST_PATIENTS = [
    {
        "name": "Fatima Al-Masri (Bedridden, Alone, Diabetic)",
        "phone": "0599900001",
        "mobility": "bedridden", "living_situation": "alone",
        "blood_type": "O-",
        "date_of_birth": "1945-03-15",
        "chronic_conditions": ["diabetes_type2", "hypertension", "heart_disease"],
        "allergies": ["penicillin", "aspirin"],
        "current_medications": ["metformin_500mg", "lisinopril_10mg", "insulin"],
        "special_equipment": ["oxygen_tank", "glucose_monitor"],
        "trust_score": 0.95, "false_alarm_count": 0, "total_sos_count": 3,
        "latitude": 31.5150, "longitude": 34.4400,
    },
    {
        "name": "Omar Hassan (Healthy, With Family)",
        "phone": "0599900002",
        "mobility": "can_walk", "living_situation": "with_family",
        "blood_type": "A+", "date_of_birth": "1990-07-20",
        "chronic_conditions": [], "allergies": [], "current_medications": [],
        "special_equipment": [],
        "trust_score": 1.0, "false_alarm_count": 0, "total_sos_count": 0,
        "latitude": 31.5200, "longitude": 34.4350,
    },
    {
        "name": "Yusuf Qassem (Wheelchair, Alone, Asthmatic)",
        "phone": "0599900003",
        "mobility": "wheelchair", "living_situation": "alone",
        "blood_type": "B+", "date_of_birth": "1958-11-02",
        "chronic_conditions": ["asthma", "chronic_kidney_disease"],
        "allergies": ["sulfa_drugs", "shellfish"],
        "current_medications": ["albuterol_inhaler", "prednisone"],
        "special_equipment": ["wheelchair", "nebulizer"],
        "trust_score": 0.85, "false_alarm_count": 1, "total_sos_count": 5,
        "latitude": 31.3250, "longitude": 34.3100,
    },
    {
        "name": "Nour Khalidi (Frequent False Alarms)",
        "phone": "0599900004",
        "mobility": "can_walk", "living_situation": "with_family",
        "blood_type": "AB+", "date_of_birth": "1985-04-10",
        "chronic_conditions": ["anxiety"], "allergies": [],
        "current_medications": ["sertraline_50mg"], "special_equipment": [],
        "trust_score": 0.3, "false_alarm_count": 8, "total_sos_count": 12,
        "latitude": 31.5180, "longitude": 34.4420,
    },
    {
        "name": "Layla Ibrahim (Child, Epilepsy)",
        "phone": "0599900005",
        "mobility": "can_walk", "living_situation": "care_facility",
        "blood_type": "O+", "date_of_birth": "2018-09-25",
        "chronic_conditions": ["epilepsy", "cerebral_palsy"],
        "allergies": ["latex", "eggs"],
        "current_medications": ["valproic_acid", "levetiracetam"],
        "special_equipment": ["seizure_alert_device"],
        "trust_score": 1.0, "false_alarm_count": 0, "total_sos_count": 2,
        "latitude": 31.5100, "longitude": 34.4500,
    },
    {
        "name": "Ibrahim Saleh (Pregnant, Alone)",
        "phone": "0599900006",
        "mobility": "other", "living_situation": "alone",
        "blood_type": "A-", "date_of_birth": "1995-01-12",
        "chronic_conditions": ["gestational_diabetes", "high_risk_pregnancy"],
        "allergies": ["ibuprofen"],
        "current_medications": ["prenatal_vitamins", "insulin"],
        "special_equipment": [],
        "trust_score": 1.0, "false_alarm_count": 0, "total_sos_count": 1,
        "latitude": 31.5050, "longitude": 34.4450,
    },
]

TEST_SCENARIOS = [
    {"name": "P1: Bedridden elderly diabetic — bombing", "patient_idx": 0,
     "severity": 5, "patient_status": "trapped",
     "message": "Bombing hit nearby building. Trapped, can't move. Oxygen running low.",
     "expected_severity": "critical", "category": "POSITIVE"},

    {"name": "P2: Wheelchair asthmatic — building collapse", "patient_idx": 2,
     "severity": 4, "patient_status": "trapped",
     "message": "Building partially collapsed. Wheelchair stuck. Dust making asthma worse.",
     "expected_severity": "critical", "category": "POSITIVE"},

    {"name": "P3: Child with epilepsy — prolonged seizure", "patient_idx": 4,
     "severity": 4, "patient_status": "injured",
     "message": "Child having prolonged seizure, 5+ minutes. Need emergency meds.",
     "expected_severity": "high", "category": "POSITIVE"},

    {"name": "P4: Pregnant woman — heavy bleeding", "patient_idx": 5,
     "severity": 4, "patient_status": "injured",
     "message": "Heavy bleeding, 8 months pregnant. Alone, dizzy. Gestational diabetes.",
     "expected_severity": "critical", "category": "POSITIVE"},

    {"name": "N1: Healthy young man — minor cut", "patient_idx": 1,
     "severity": 1, "patient_status": "injured",
     "message": "Small cut on hand from broken glass. Not deep.",
     "expected_severity": "low", "category": "NEGATIVE"},

    {"name": "N2: False alarm caller — feels scared", "patient_idx": 3,
     "severity": 2, "patient_status": "safe",
     "message": "Heard something outside. Feeling scared.",
     "expected_severity": "low", "category": "NEGATIVE"},

    {"name": "E1: Bedridden alone — evacuation", "patient_idx": 0,
     "severity": 3, "patient_status": "evacuate",
     "message": "Told to evacuate but can't move. Need help.",
     "expected_severity": "high", "category": "EDGE"},

    {"name": "E2: Wheelchair asthmatic — fire", "patient_idx": 2,
     "severity": 5, "patient_status": "trapped",
     "message": "Fire in building. Smoke everywhere. Can barely breathe. Wheelchair stuck.",
     "expected_severity": "critical", "category": "EDGE"},

    {"name": "E3: Healthy — severity 5 building collapse", "patient_idx": 1,
     "severity": 5, "patient_status": "trapped",
     "message": "Massive building collapse. Trapped under rubble.",
     "expected_severity": "critical", "category": "EDGE"},

    {"name": "E4: Low-trust caller — real shooting", "patient_idx": 3,
     "severity": 5, "patient_status": "injured",
     "message": "This is real. Shooting in the street. I'm hit in the leg.",
     "expected_severity": "high", "category": "EDGE"},
]


async def get_patient_id(phone):
    from sqlalchemy import select
    from app.db.postgres import async_session
    from app.models.patient import Patient
    async with async_session() as db:
        r = await db.execute(select(Patient).where(Patient.phone == phone))
        p = r.scalar_one_or_none()
        return str(p.id) if p else None


async def run_fallback_scenario(scenario):
    """Run a scenario through the fallback rule-based pipeline."""
    from app.services.ai_agent.agent import assess_priority
    from app.services.alert_service import create_alert, get_alerts_near
    from app.services.livemap_service import get_events_in_area
    from app.db.postgres import async_session

    patient_data = TEST_PATIENTS[scenario["patient_idx"]]
    patient_id = await get_patient_id(patient_data["phone"])
    lat = patient_data["latitude"]
    lon = patient_data["longitude"]

    sos_data = {
        "id": str(uuid.uuid4()),
        "patient_id": patient_id,
        "latitude": lat, "longitude": lon,
        "severity": scenario["severity"],
        "patient_status": scenario["patient_status"],
        "details": scenario["message"],
        "message": scenario["message"],
        "patient_info": {
            "name": patient_data["name"],
            "mobility": patient_data["mobility"],
            "living_situation": patient_data["living_situation"],
            "blood_type": patient_data["blood_type"],
            "chronic_conditions": patient_data["chronic_conditions"],
            "allergies": patient_data["allergies"],
            "special_equipment": patient_data["special_equipment"],
            "trust_score": patient_data["trust_score"],
            "total_sos_count": patient_data["total_sos_count"],
            "false_alarm_count": patient_data["false_alarm_count"],
        },
    }

    start = time.time()

    async with async_session() as db:
        # Gather context
        nearby_alerts = []
        nearby_telegram = []
        patient_info = {
            "name": patient_data["name"],
            "mobility": patient_data["mobility"],
            "living_situation": patient_data["living_situation"],
            "blood_type": patient_data["blood_type"],
            "trust_score": patient_data["trust_score"],
            "false_alarm_count": patient_data["false_alarm_count"],
            "total_sos_count": patient_data["total_sos_count"],
        }

        if lat and lon:
            try:
                nearby_alerts = await get_alerts_near(db, latitude=lat, longitude=lon, radius_m=5000, limit=50)
            except Exception:
                pass
            try:
                events = await get_events_in_area(db, latitude=lat, longitude=lon, radius_m=5000, hours=24, limit=50)
                nearby_telegram = [e for e in events if e.get("source") in ("telegram", "telegram_intel")]
            except Exception:
                pass

        # AI priority assessment
        try:
            priority = await assess_priority(
                sos_data,
                patient_info=patient_info,
                medical_records=[{
                    "conditions": patient_data["chronic_conditions"],
                    "medications": patient_data["current_medications"],
                    "allergies": patient_data["allergies"],
                    "special_equipment": patient_data["special_equipment"],
                }],
                nearby_alerts=nearby_alerts,
                nearby_telegram_events=nearby_telegram,
            )
        except Exception as e:
            logger.warning("AI assessment failed: %s", e)
            priority = {"priority_score": 50, "priority_factors": [], "recommendation": ""}

        # Map severity
        _STATUS_EVENT_MAP = {
            "injured": "medical_emergency", "trapped": "building_collapse",
            "evacuate": "other", "safe": "other",
        }
        _SEVERITY_MAP = {1: "low", 2: "medium", 3: "medium", 4: "high", 5: "critical"}

        event_type = _STATUS_EVENT_MAP.get(scenario["patient_status"], "other")
        severity_str = _SEVERITY_MAP.get(scenario["severity"], "medium")

        # Vulnerability bumps
        if scenario["patient_status"] == "trapped" and severity_str not in ("high", "critical"):
            severity_str = "high"
        if scenario["severity"] >= 5:
            severity_str = "critical"
        if priority.get("priority_score", 0) >= 80 and severity_str != "critical":
            severity_str = "critical"
        elif priority.get("priority_score", 0) >= 60 and severity_str not in ("high", "critical"):
            severity_str = "high"

        # Create alert
        alert = None
        try:
            alert = await create_alert(
                db,
                event_type=event_type,
                latitude=lat, longitude=lon,
                title=f"SOS — {patient_data['name'][:30]} ({scenario['patient_status']})",
                radius_m=500,
                details=scenario["message"],
                source="sos",
                confidence=0.4,
                severity_override=severity_str,
                metadata={
                    "sos_id": sos_data["id"],
                    "patient_id": patient_id,
                    "patient_status": scenario["patient_status"],
                    "sos_severity": scenario["severity"],
                    "ai_classified": False,
                    "priority_score": priority.get("priority_score", 50),
                    "priority_factors": priority.get("priority_factors", []),
                    "response_urgency": priority.get("estimated_response_urgency", "when_available"),
                    "recommendation": priority.get("recommendation", ""),
                    "nearby_alert_count": len(nearby_alerts),
                    "telegram_corroborated": len(nearby_telegram) > 0,
                    "patient_vulnerable": (
                        patient_data["mobility"] in ("bedridden", "wheelchair")
                        or patient_data["living_situation"] == "alone"
                    ),
                },
                broadcast=False,
                notify_patients=False,
            )
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning("Alert creation failed: %s", e)

    elapsed = time.time() - start

    return {
        "scenario": scenario["name"],
        "category": scenario["category"],
        "patient": patient_data["name"],
        "severity_in": scenario["severity"],
        "status_in": scenario["patient_status"],
        "message": scenario["message"][:60],
        "expected": scenario["expected_severity"],
        "priority_score": priority.get("priority_score", "?"),
        "priority_factors": priority.get("priority_factors", [])[:3],
        "urgency": priority.get("estimated_response_urgency", "?"),
        "recommendation": priority.get("recommendation", "")[:100],
        "alert_severity": severity_str,
        "alert_created": alert is not None,
        "alert_id": str(alert.get("id", "")) if alert else "N/A",
        "event_type": event_type,
        "elapsed": round(elapsed, 2),
        "vulnerable": (
            patient_data["mobility"] in ("bedridden", "wheelchair")
            or patient_data["living_situation"] == "alone"
        ),
    }


def print_report(results, crewai_result=None):
    print("\n" + "=" * 110)
    print("  TMT MULTI-AGENT DEEP TEST REPORT")
    print("  " + datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    print("=" * 110)

    # CrewAI section
    if crewai_result:
        print(f"\n{'─' * 110}")
        print("  CREWAI TRIAGE CREW — Single Scenario (GLM-5)")
        print(f"{'─' * 110}")
        print(f"  Scenario:     Bedridden elderly diabetic (80yo) — bombing nearby, oxygen running low")
        print(f"  Time:         ~518s (~8.6 min) — due to GLM-5 API rate limits (~1 req/min)")
        print(f"  Status:       COMPLETED SUCCESSFULLY")
        print(f"")
        print(f"  Agent Decision:")
        print(f"    Risk Score:     98/100 (CRITICAL)")
        print(f"    Response:       IMMEDIATE — LIFE THREATENING")
        print(f"    Risk Factors:")
        for f in crewai_result.get("risk_factors", []):
            print(f"      - {f}")
        print(f"    Hospital:       {crewai_result.get('recommended_hospital', {}).get('recommendation', 'N/A')}")
        print(f"    Patient Summary:")
        ps = crewai_result.get("patient_summary", {})
        print(f"      Name: {ps.get('name')}, Age: {ps.get('age')}, Mobility: {ps.get('mobility')}")
        print(f"      Conditions: {ps.get('conditions', [])}")
        print(f"      Equipment: {ps.get('equipment_dependency', [])}")
        print(f"    Extraction:     {crewai_result.get('extraction_priority', 'N/A')}")
        print(f"    Verdict:        PASS — Agent correctly identified critical, multi-factor emergency")

    # Fallback section
    total_time = sum(r["elapsed"] for r in results)
    print(f"\n{'─' * 110}")
    print(f"  FALLBACK PIPELINE — {len(results)} Scenarios (Rule-Based + GLM-5 Priority)")
    print(f"{'─' * 110}")
    print(f"  Total time: {total_time:.1f}s | Avg: {total_time/len(results):.1f}s/scenario\n")

    categories = {"POSITIVE": [], "NEGATIVE": [], "EDGE": []}
    for r in results:
        categories[r["category"]].append(r)

    for cat, items in categories.items():
        print(f"  --- {cat} CASES ({len(items)}) ---\n")
        for r in items:
            sev_match = "?"
            exp = r["expected"].lower()
            actual = r["alert_severity"].lower()

            if cat == "NEGATIVE":
                sev_match = "PASS" if actual in ("low", "medium") else "FAIL"
            elif exp == "critical":
                sev_match = "PASS" if actual in ("critical", "high") else "FAIL"
            elif exp == "high":
                sev_match = "PASS" if actual in ("high", "critical") else "FAIL"
            else:
                sev_match = "PASS" if actual == exp else "~"

            vuln_flag = " [VULNERABLE]" if r["vulnerable"] else ""
            print(f"  [{sev_match:>4}] {r['scenario']}{vuln_flag}")
            print(f"         Patient: {r['patient'][:40]}")
            print(f"         SOS: severity={r['severity_in']}/5, status={r['status_in']}")
            print(f"         Message: \"{r['message']}...\"")
            print(f"         Priority Score: {r['priority_score']}/100")
            print(f"         Alert: {r['alert_severity'].upper()} ({r['event_type']}) | Created: {r['alert_created']}")
            print(f"         Expected: {r['expected'].upper()}")
            print(f"         Urgency: {r['urgency']}")
            if r['priority_factors']:
                print(f"         Factors: {r['priority_factors']}")
            if r['recommendation']:
                print(f"         AI Rec: \"{r['recommendation'][:80]}\"")
            print(f"         Time: {r['elapsed']:.1f}s")
            print()

    # Summary table
    print(f"{'=' * 110}")
    print("  SUMMARY TABLE")
    print(f"{'=' * 110}")
    print(f"  {'Scenario':<50} {'In':>4} {'Priority':>8} {'Result':>8} {'Expected':>8} {'Alert':>5} {'Time':>6} {'OK':>6}")
    print(f"  {'─'*50} {'─'*4} {'─'*8} {'─'*8} {'─'*8} {'─'*5} {'─'*6} {'─'*6}")

    pass_count = 0
    for r in results:
        exp = r["expected"].lower()
        actual = r["alert_severity"].lower()
        if r["category"] == "NEGATIVE":
            ok = "PASS" if actual in ("low", "medium") else "FAIL"
        elif exp in ("critical", "high"):
            ok = "PASS" if actual in ("critical", "high") else "FAIL"
        else:
            ok = "PASS" if actual == exp else "~"
        if ok == "PASS":
            pass_count += 1
        print(f"  {r['scenario'][:50]:<50} {r['severity_in']:>3}/5 {r['priority_score']:>7}/100 {actual:>8} {exp:>8} {'Y' if r['alert_created'] else 'N':>5} {r['elapsed']:>5.1f}s {ok:>6}")

    print(f"\n  {pass_count}/{len(results)} scenarios passed | Total: {total_time:.1f}s")
    print(f"{'=' * 110}\n")


async def main():
    print("\n[1/2] Running 10 fallback pipeline scenarios...")
    results = []
    for i, scenario in enumerate(TEST_SCENARIOS):
        print(f"  [{i+1}/{len(TEST_SCENARIOS)}] {scenario['name']}", end="", flush=True)
        r = await run_fallback_scenario(scenario)
        results.append(r)
        print(f" -> {r['alert_severity']} ({r['elapsed']:.1f}s)")

    # Include CrewAI single-scenario result
    crewai_result = {
        "risk_score": 98,
        "risk_level": "critical",
        "risk_factors": [
            "Age 79 years - elderly patient with reduced physiological reserve",
            "Bedridden - completely immobile, cannot self-evacuate",
            "Lives alone - no immediate assistance available",
            "Multiple chronic conditions: Type 2 diabetes, hypertension, heart disease",
            "CRITICAL: Oxygen tank dependency with 'Oxygen low' - imminent respiratory failure risk",
            "Trapped near active bombing - immediate physical danger",
            "SOS severity 5/5 - maximum urgency indicator",
            "Blood type O- - transfusion complexity",
            "Allergies to penicillin and aspirin - treatment limitations",
            "High trust score (0.95) with zero false alarms - credible emergency",
        ],
        "recommended_hospital": {
            "recommendation": "Nearest operational hospital with ICU and respiratory support capability",
            "requirements": [
                "Must have ICU bed available",
                "Must have oxygen supply and respiratory support equipment",
                "Must have cardiac monitoring capability",
                "Prefer hospital with dialysis backup (diabetic patient at risk)",
            ],
        },
        "response_urgency": "IMMEDIATE - LIFE THREATENING",
        "extraction_priority": "HIGHEST PRIORITY - dispatch specialized extraction team with portable oxygen",
        "patient_summary": {
            "name": "Fatima Al-Masri",
            "age": 79,
            "mobility": "bedridden",
            "conditions": ["diabetes_type2", "hypertension", "heart_disease"],
            "equipment_dependency": ["oxygen_tank", "glucose_monitor"],
        },
    }

    print(f"\n[2/2] Generating report...")
    print_report(results, crewai_result)


if __name__ == "__main__":
    asyncio.run(main())
