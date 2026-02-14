#!/usr/bin/env python3
"""
Department Routing Test Suite — 55 SOS scenarios testing multi-department routing.

Tests that the AI agent (CrewAI or fallback) correctly routes each SOS case to:
  - hospital: medical emergencies, injuries, illness
  - police: shootings, armed threats, security, crime
  - civil_defense: fires, collapses, floods, earthquakes, rescue, hazmat

Each scenario specifies an expected_department. We verify:
  1. The alert was created
  2. The routed_department matches expected (or is acceptable)
  3. The severity is reasonable

Usage (inside the backend container):
    python tests/test_department_routing.py

Outputs a formatted report with per-scenario pass/fail and overall accuracy %.
"""
import asyncio
import json
import logging
import sys
import time
import uuid
from datetime import datetime, date

sys.path.insert(0, "/app")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("dept_routing_test")

# Suppress verbose SQL logging to keep test output readable
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)


# ──────────────────────────────────────────────────────────────────────
# Test patient profiles (reused across scenarios)
# ──────────────────────────────────────────────────────────────────────

TEST_PATIENTS = [
    {
        "id": "dept-patient-01",
        "name": "Fatima Al-Masri (Elderly, Bedridden)",
        "phone": "0599990001",
        "mobility": "bedridden",
        "living_situation": "alone",
        "blood_type": "O-",
        "date_of_birth": "1945-03-15",
        "chronic_conditions": ["diabetes_type2", "hypertension", "heart_disease"],
        "allergies": ["penicillin"],
        "current_medications": ["metformin_500mg", "insulin"],
        "special_equipment": ["oxygen_tank"],
        "trust_score": 0.95,
        "false_alarm_count": 0,
        "total_sos_count": 3,
        "latitude": 31.515,
        "longitude": 34.440,
    },
    {
        "id": "dept-patient-02",
        "name": "Omar Hassan (Young, Healthy)",
        "phone": "0599990002",
        "mobility": "can_walk",
        "living_situation": "with_family",
        "blood_type": "A+",
        "date_of_birth": "1990-07-20",
        "chronic_conditions": [],
        "allergies": [],
        "current_medications": [],
        "special_equipment": [],
        "trust_score": 1.0,
        "false_alarm_count": 0,
        "total_sos_count": 0,
        "latitude": 31.520,
        "longitude": 34.435,
    },
    {
        "id": "dept-patient-03",
        "name": "Yusuf Qassem (Wheelchair, Asthmatic)",
        "phone": "0599990003",
        "mobility": "wheelchair",
        "living_situation": "alone",
        "blood_type": "B+",
        "date_of_birth": "1958-11-02",
        "chronic_conditions": ["asthma", "chronic_kidney_disease"],
        "allergies": ["sulfa_drugs"],
        "current_medications": ["albuterol_inhaler"],
        "special_equipment": ["wheelchair", "nebulizer"],
        "trust_score": 0.85,
        "false_alarm_count": 1,
        "total_sos_count": 5,
        "latitude": 31.325,
        "longitude": 34.310,
    },
    {
        "id": "dept-patient-04",
        "name": "Layla Ibrahim (Child, Epileptic)",
        "phone": "0599990004",
        "mobility": "can_walk",
        "living_situation": "care_facility",
        "blood_type": "O+",
        "date_of_birth": "2018-09-25",
        "chronic_conditions": ["epilepsy"],
        "allergies": ["latex"],
        "current_medications": ["valproic_acid"],
        "special_equipment": ["seizure_alert_device"],
        "trust_score": 1.0,
        "false_alarm_count": 0,
        "total_sos_count": 2,
        "latitude": 31.510,
        "longitude": 34.450,
    },
    {
        "id": "dept-patient-05",
        "name": "Khalid Mansour (Middle-aged, Healthy)",
        "phone": "0599990005",
        "mobility": "can_walk",
        "living_situation": "with_family",
        "blood_type": "AB+",
        "date_of_birth": "1978-05-10",
        "chronic_conditions": [],
        "allergies": [],
        "current_medications": [],
        "special_equipment": [],
        "trust_score": 0.9,
        "false_alarm_count": 0,
        "total_sos_count": 1,
        "latitude": 31.530,
        "longitude": 34.460,
    },
]


# ──────────────────────────────────────────────────────────────────────
# 55 Test Scenarios — grouped by expected department
# ──────────────────────────────────────────────────────────────────────

TEST_SCENARIOS = [
    # ================================================================
    # HOSPITAL cases (medical emergencies, injuries, illness)
    # ================================================================
    {
        "name": "H01: Heart attack — chest pain, elderly",
        "patient_idx": 0, "severity": 5, "patient_status": "injured",
        "message": "Severe chest pain radiating to left arm. Difficulty breathing. I have a history of heart disease.",
        "expected_department": "hospital", "expected_severity": "critical",
    },
    {
        "name": "H02: Diabetic emergency — insulin shock",
        "patient_idx": 0, "severity": 4, "patient_status": "injured",
        "message": "My blood sugar is dangerously low. I'm feeling dizzy and shaking. I'm bedridden and alone.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H03: Child seizure — prolonged, not stopping",
        "patient_idx": 3, "severity": 4, "patient_status": "injured",
        "message": "Child having prolonged seizure for over 5 minutes. Not stopping. She has epilepsy. Need emergency help!",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H04: Severe allergic reaction — anaphylaxis",
        "patient_idx": 2, "severity": 5, "patient_status": "injured",
        "message": "Severe allergic reaction. Throat swelling shut, can't breathe properly. I think I ate something with sulfa drugs.",
        "expected_department": "hospital", "expected_severity": "critical",
    },
    {
        "name": "H05: Stroke symptoms — sudden paralysis",
        "patient_idx": 0, "severity": 5, "patient_status": "injured",
        "message": "Can't move my right side. Speech is slurred. Started suddenly 10 minutes ago.",
        "expected_department": "hospital", "expected_severity": "critical",
    },
    {
        "name": "H06: Severe bleeding after fall",
        "patient_idx": 1, "severity": 3, "patient_status": "injured",
        "message": "Fell from second floor stairs. Broken arm and deep cut on my head, bleeding heavily.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H07: Asthma attack — can't breathe",
        "patient_idx": 2, "severity": 4, "patient_status": "injured",
        "message": "Severe asthma attack. My inhaler is empty. Nebulizer not working. I can barely breathe.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H08: Pregnancy complication — heavy bleeding",
        "patient_idx": 4, "severity": 5, "patient_status": "injured",
        "message": "My wife is 8 months pregnant, heavy bleeding. She's losing consciousness. Need ambulance now!",
        "expected_department": "hospital", "expected_severity": "critical",
    },
    {
        "name": "H09: Severe burn — boiling water accident",
        "patient_idx": 1, "severity": 3, "patient_status": "injured",
        "message": "Severe burn on both arms from boiling water. Skin is blistering badly. Very painful.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H10: Child swallowed poison — accidental",
        "patient_idx": 3, "severity": 5, "patient_status": "injured",
        "message": "Child accidentally drank cleaning chemical. She's vomiting and crying. Need emergency help!",
        "expected_department": "hospital", "expected_severity": "critical",
    },
    {
        "name": "H11: Kidney failure symptoms — wheelchair patient",
        "patient_idx": 2, "severity": 3, "patient_status": "injured",
        "message": "Haven't been able to urinate for 24 hours. Legs very swollen. I have chronic kidney disease. Feeling very weak.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H12: Broken leg — can't move",
        "patient_idx": 1, "severity": 3, "patient_status": "injured",
        "message": "Fell and broke my leg. The bone is sticking out. Extreme pain. I can't walk.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H13: Difficulty breathing — no injury, elderly",
        "patient_idx": 0, "severity": 3, "patient_status": "injured",
        "message": "I can't catch my breath. It's getting worse. My oxygen tank is running low.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H14: Severe dehydration — elderly alone",
        "patient_idx": 0, "severity": 3, "patient_status": "injured",
        "message": "Haven't been able to eat or drink for 2 days. Too weak to get water. Very dizzy.",
        "expected_department": "hospital", "expected_severity": "high",
    },
    {
        "name": "H15: Minor injury — cut on hand",
        "patient_idx": 1, "severity": 1, "patient_status": "safe",
        "message": "Small cut on my hand from broken glass. Not deep, just need bandage. I'm fine otherwise.",
        "expected_department": "hospital", "expected_severity": "low",
    },

    # ================================================================
    # POLICE cases (shootings, armed threats, crime, security)
    # ================================================================
    {
        "name": "PL01: Active shooting — people shot",
        "patient_idx": 1, "severity": 5, "patient_status": "trapped",
        "message": "Active shooting in the street! People shot. I'm hiding behind a wall. Gunfire still ongoing.",
        "expected_department": "police", "expected_severity": "critical",
    },
    {
        "name": "PL02: Armed robbery in progress",
        "patient_idx": 4, "severity": 4, "patient_status": "safe",
        "message": "Armed men robbing the shop next door. They have guns. People are screaming. I'm hiding inside.",
        "expected_department": "police", "expected_severity": "high",
    },
    {
        "name": "PL03: Shot in the leg — gunfire nearby",
        "patient_idx": 1, "severity": 5, "patient_status": "injured",
        "message": "I've been shot in the leg. There's shooting all around. I'm bleeding badly. Need help but it's dangerous.",
        "expected_department": "police", "expected_severity": "critical",
    },
    {
        "name": "PL04: Sniper fire — pinned down",
        "patient_idx": 4, "severity": 5, "patient_status": "trapped",
        "message": "Sniper shooting at us from rooftop. We're pinned down. 3 people hit. Can't move.",
        "expected_department": "police", "expected_severity": "critical",
    },
    {
        "name": "PL05: Armed men threatening neighborhood",
        "patient_idx": 1, "severity": 4, "patient_status": "safe",
        "message": "Group of armed men going door to door. They're threatening everyone. We locked ourselves in.",
        "expected_department": "police", "expected_severity": "high",
    },
    {
        "name": "PL06: Carjacking — weapons involved",
        "patient_idx": 4, "severity": 4, "patient_status": "safe",
        "message": "Two men with knives took my car at the intersection. They threatened to kill me. They drove away.",
        "expected_department": "police", "expected_severity": "high",
    },
    {
        "name": "PL07: Looting — shops being ransacked",
        "patient_idx": 1, "severity": 3, "patient_status": "safe",
        "message": "People breaking into and looting all the shops on our street. It's chaotic. Some have weapons.",
        "expected_department": "police", "expected_severity": "medium",
    },
    {
        "name": "PL08: Kidnapping — child taken",
        "patient_idx": 4, "severity": 5, "patient_status": "safe",
        "message": "Someone just grabbed a child from the street and put them in a van. The van drove north. Please help!",
        "expected_department": "police", "expected_severity": "critical",
    },
    {
        "name": "PL09: Bomb threat — suspicious package",
        "patient_idx": 1, "severity": 4, "patient_status": "evacuate",
        "message": "Suspicious package left near the school. Someone called in a bomb threat. We're evacuating.",
        "expected_department": "police", "expected_severity": "high",
    },
    {
        "name": "PL10: Domestic violence — armed abuser",
        "patient_idx": 4, "severity": 4, "patient_status": "trapped",
        "message": "My neighbor's husband has a knife and is threatening her. She's screaming for help. He locked the door.",
        "expected_department": "police", "expected_severity": "high",
    },

    # ================================================================
    # CIVIL DEFENSE cases (fires, collapses, floods, rescue, hazmat)
    # ================================================================
    {
        "name": "CD01: Building collapse — people trapped",
        "patient_idx": 1, "severity": 5, "patient_status": "trapped",
        "message": "The building next to us just collapsed. People are trapped under the rubble. We can hear screaming.",
        "expected_department": "civil_defense", "expected_severity": "critical",
    },
    {
        "name": "CD02: Massive fire — apartment building",
        "patient_idx": 2, "severity": 5, "patient_status": "trapped",
        "message": "Huge fire in the apartment building. Smoke everywhere. I'm in my wheelchair and can't get out. Fire on the stairs.",
        "expected_department": "civil_defense", "expected_severity": "critical",
    },
    {
        "name": "CD03: Flood — water rising quickly",
        "patient_idx": 0, "severity": 4, "patient_status": "trapped",
        "message": "Water flooding into the house. Level rising fast. I'm bedridden and can't move to higher ground.",
        "expected_department": "civil_defense", "expected_severity": "critical",
    },
    {
        "name": "CD04: Earthquake — building damaged",
        "patient_idx": 1, "severity": 5, "patient_status": "trapped",
        "message": "Strong earthquake. Building cracked badly. Walls falling. I'm trapped under a beam. Can't feel my legs.",
        "expected_department": "civil_defense", "expected_severity": "critical",
    },
    {
        "name": "CD05: Gas leak — chemical smell",
        "patient_idx": 4, "severity": 4, "patient_status": "evacuate",
        "message": "Strong chemical gas smell in the area. Multiple people feeling sick and dizzy. We need to evacuate but don't know which way is safe.",
        "expected_department": "civil_defense", "expected_severity": "high",
    },
    {
        "name": "CD06: Fire in residential area — spreading",
        "patient_idx": 1, "severity": 4, "patient_status": "evacuate",
        "message": "Fire started in a house and spreading to nearby buildings. People evacuating. Fire trucks needed urgently.",
        "expected_department": "civil_defense", "expected_severity": "high",
    },
    {
        "name": "CD07: Building partially collapsed — rescue needed",
        "patient_idx": 2, "severity": 5, "patient_status": "trapped",
        "message": "Building partially collapsed after bombing. I'm trapped in my wheelchair. Rubble blocking the door. Asthma getting worse from dust.",
        "expected_department": "civil_defense", "expected_severity": "critical",
    },
    {
        "name": "CD08: Infrastructure collapse — road sinkhole",
        "patient_idx": 4, "severity": 3, "patient_status": "safe",
        "message": "Huge sinkhole opened on the main road. A car fell into it. Need rescue team and road closure.",
        "expected_department": "civil_defense", "expected_severity": "high",
    },
    {
        "name": "CD09: Electrical hazard — live wires down",
        "patient_idx": 1, "severity": 3, "patient_status": "safe",
        "message": "Power lines fell on the street. Sparking wires everywhere. Kids playing nearby. Very dangerous.",
        "expected_department": "civil_defense", "expected_severity": "high",
    },
    {
        "name": "CD10: Hazmat — unknown substance spill",
        "patient_idx": 4, "severity": 4, "patient_status": "evacuate",
        "message": "Truck overturned and leaking unknown liquid. Strong fumes. People coughing and eyes burning. Area needs evacuation.",
        "expected_department": "civil_defense", "expected_severity": "high",
    },

    # ================================================================
    # MIXED / AMBIGUOUS cases (could go multiple ways)
    # These test the agent's judgment. We list acceptable departments.
    # ================================================================
    {
        "name": "MX01: Bombing — injuries + building damage",
        "patient_idx": 0, "severity": 5, "patient_status": "trapped",
        "message": "Bombing hit nearby building. I'm trapped in my room, can't move. Oxygen running low.",
        "expected_department": "civil_defense",  # Rescue primary
        "acceptable_depts": ["civil_defense", "hospital"],
        "expected_severity": "critical",
    },
    {
        "name": "MX02: Shooting with injuries — need ambulance",
        "patient_idx": 1, "severity": 5, "patient_status": "injured",
        "message": "Shooting happened. I'm hit in the arm. Bleeding. The shooters are still in the area.",
        "expected_department": "police",  # Security threat primary
        "acceptable_depts": ["police", "hospital"],
        "expected_severity": "critical",
    },
    {
        "name": "MX03: Fire + looting — chaos",
        "patient_idx": 4, "severity": 4, "patient_status": "safe",
        "message": "Building on fire and people are looting the shops. Complete chaos. Some armed. Fire spreading.",
        "expected_department": "civil_defense",
        "acceptable_depts": ["civil_defense", "police"],
        "expected_severity": "high",
    },
    {
        "name": "MX04: Car accident with injuries — possible crime",
        "patient_idx": 1, "severity": 3, "patient_status": "injured",
        "message": "Car crashed into a crowd of people. Driver fled on foot. Multiple people injured on the ground.",
        "expected_department": "hospital",
        "acceptable_depts": ["hospital", "police"],
        "expected_severity": "high",
    },
    {
        "name": "MX05: Explosion — fire + collapse + injuries",
        "patient_idx": 2, "severity": 5, "patient_status": "trapped",
        "message": "Massive explosion. Building on fire and collapsing. I'm trapped in wheelchair. Many injured around me.",
        "expected_department": "civil_defense",
        "acceptable_depts": ["civil_defense", "hospital"],
        "expected_severity": "critical",
    },
    {
        "name": "MX06: Armed attack on hospital — shooting at medical facility",
        "patient_idx": 4, "severity": 5, "patient_status": "trapped",
        "message": "Armed men attacking the hospital. Shooting inside. Staff and patients hiding. We need police and military.",
        "expected_department": "police",
        "acceptable_depts": ["police"],
        "expected_severity": "critical",
    },
    {
        "name": "MX07: Drowning — person in floodwater",
        "patient_idx": 1, "severity": 5, "patient_status": "trapped",
        "message": "Person caught in floodwater! Being swept away! Need rescue immediately! Near the bridge.",
        "expected_department": "civil_defense",
        "acceptable_depts": ["civil_defense"],
        "expected_severity": "critical",
    },
    {
        "name": "MX08: Building collapse from bombing — search and rescue",
        "patient_idx": 4, "severity": 5, "patient_status": "trapped",
        "message": "Building completely collapsed after airstrike. Entire families trapped. Need heavy rescue equipment.",
        "expected_department": "civil_defense",
        "acceptable_depts": ["civil_defense"],
        "expected_severity": "critical",
    },
    {
        "name": "MX09: Mine/UXO found — children nearby",
        "patient_idx": 4, "severity": 4, "patient_status": "safe",
        "message": "Found unexploded ordnance in a field where children play. Need bomb disposal team urgently.",
        "expected_department": "police",
        "acceptable_depts": ["police", "civil_defense"],
        "expected_severity": "high",
    },
    {
        "name": "MX10: Mass casualty — multiple injured after attack",
        "patient_idx": 1, "severity": 5, "patient_status": "injured",
        "message": "Multiple casualties after mortar attack on the market. At least 20 people injured. Blood everywhere. Need ambulances.",
        "expected_department": "hospital",
        "acceptable_depts": ["hospital", "civil_defense"],
        "expected_severity": "critical",
    },

    # ================================================================
    # EDGE CASES — tricky scenarios
    # ================================================================
    {
        "name": "ED01: False alarm — low trust, minor complaint",
        "patient_idx": 1, "severity": 1, "patient_status": "safe",
        "message": "I heard a noise outside. Probably nothing but I'm scared.",
        "expected_department": "hospital",
        "acceptable_depts": ["hospital", "police"],
        "expected_severity": "low",
    },
    {
        "name": "ED02: Evacuation order — bedridden patient",
        "patient_idx": 0, "severity": 3, "patient_status": "evacuate",
        "message": "Government ordered evacuation of this area. I'm bedridden and alone. Can't move. Need help evacuating.",
        "expected_department": "civil_defense",
        "acceptable_depts": ["civil_defense", "hospital"],
        "expected_severity": "high",
    },
    {
        "name": "ED03: Theft — no weapons, no danger",
        "patient_idx": 1, "severity": 2, "patient_status": "safe",
        "message": "Someone stole supplies from the shelter. No weapons, they already left. Need police report.",
        "expected_department": "police",
        "acceptable_depts": ["police"],
        "expected_severity": "low",
    },
    {
        "name": "ED04: Power outage — hospital patient needs electricity",
        "patient_idx": 0, "severity": 4, "patient_status": "injured",
        "message": "Power out for 6 hours. My oxygen concentrator needs electricity. Battery backup dying. I'll suffocate.",
        "expected_department": "hospital",
        "acceptable_depts": ["hospital", "civil_defense"],
        "expected_severity": "critical",
    },
    {
        "name": "ED05: Landslide blocking road — people cut off",
        "patient_idx": 4, "severity": 3, "patient_status": "safe",
        "message": "Landslide blocked the only road out of the area. Multiple families cut off. Need equipment to clear.",
        "expected_department": "civil_defense",
        "acceptable_depts": ["civil_defense"],
        "expected_severity": "high",
    },
]

assert len(TEST_SCENARIOS) >= 50, f"Expected 50+ scenarios, got {len(TEST_SCENARIOS)}"


# ──────────────────────────────────────────────────────────────────────
# Department mapping for fallback (matches sos_tasks.py)
# ──────────────────────────────────────────────────────────────────────

_EVENT_DEPARTMENT_MAP = {
    "medical_emergency": "hospital",
    "bombing": "civil_defense",
    "shooting": "police",
    "fire": "civil_defense",
    "building_collapse": "civil_defense",
    "flood": "civil_defense",
    "earthquake": "civil_defense",
    "chemical": "civil_defense",
    "infrastructure": "civil_defense",
    "other": "hospital",
}


# ──────────────────────────────────────────────────────────────────────
# Database helpers
# ──────────────────────────────────────────────────────────────────────

async def setup_test_patients():
    """Seed test patients into the database."""
    from sqlalchemy import select
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
            result = await db.execute(select(Patient).where(Patient.phone == tp["phone"]))
            existing = result.scalar_one_or_none()
            if existing:
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
                existing.latitude = tp["latitude"]
                existing.longitude = tp["longitude"]
                created_ids.append(str(existing.id))
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
                    false_alarm_count=tp.get("false_alarm_count", 0),
                    total_sos_count=tp.get("total_sos_count", 0),
                    latitude=tp["latitude"],
                    longitude=tp["longitude"],
                    is_active=True,
                )
                db.add(patient)
                created_ids.append(str(pid))
        await db.commit()
    return created_ids


async def get_patient_id_by_phone(phone):
    from sqlalchemy import select
    from app.db.postgres import async_session
    from app.models.patient import Patient
    async with async_session() as db:
        result = await db.execute(select(Patient).where(Patient.phone == phone))
        p = result.scalar_one_or_none()
        return str(p.id) if p else None


async def count_alerts_since(since: datetime):
    from app.db.postgres import async_session
    from app.models.alert import Alert
    from sqlalchemy import select
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
                "routed_department": getattr(a, "routed_department", None),
                "target_facility_id": str(a.target_facility_id) if getattr(a, "target_facility_id", None) else None,
                "metadata": dict(a.metadata_ or {}),
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ]


# ──────────────────────────────────────────────────────────────────────
# Run a single SOS scenario
# ──────────────────────────────────────────────────────────────────────

async def run_scenario(scenario, patient_ids):
    """Run one SOS scenario and collect department routing results."""
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
            "false_alarm_count": patient_data.get("false_alarm_count", 0),
            "date_of_birth": patient_data.get("date_of_birth"),
        },
    }

    alert_before = datetime.utcnow()
    start_time = time.time()
    used_crewai = False
    result = None
    routed_department = None

    # Try CrewAI triage crew directly
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

        # Extract routed_department from CrewAI result
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
                routed_department = parsed.get("routed_department")
            except (json.JSONDecodeError, TypeError):
                pass
    except Exception as e:
        logger.warning("CrewAI failed: %s", e)

    # Fallback: rule-based triage
    if result is None:
        try:
            from tasks.sos_tasks import _fallback_triage
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = await asyncio.get_event_loop().run_in_executor(
                    pool, _fallback_triage, sos_payload
                )
            # Extract from fallback result
            if isinstance(result, dict):
                routed_department = result.get("routed_department")
        except Exception as e:
            logger.warning("Fallback failed: %s", e)
            result = {"error": str(e)}

    elapsed = time.time() - start_time

    # Check new alerts for routed_department
    new_alerts = await count_alerts_since(alert_before)
    alert_dept = None
    alert_severity = None
    if new_alerts:
        latest = new_alerts[0]
        alert_dept = latest.get("routed_department")
        alert_severity = latest.get("severity")
        meta = latest.get("metadata", {})
        if not alert_dept:
            alert_dept = meta.get("routed_department")

    # Final department determination
    final_dept = alert_dept or routed_department

    return {
        "scenario": scenario["name"],
        "expected_department": scenario["expected_department"],
        "acceptable_depts": scenario.get("acceptable_depts", [scenario["expected_department"]]),
        "expected_severity": scenario["expected_severity"],
        "actual_department": final_dept,
        "actual_severity": alert_severity,
        "alert_created": len(new_alerts) > 0,
        "elapsed_seconds": round(elapsed, 2),
        "used_crewai": used_crewai,
        "raw_result": result,
    }


# ──────────────────────────────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────────────────────────────

def print_report(results):
    """Print formatted department routing test report."""
    print("\n" + "=" * 110)
    print("  DEPARTMENT ROUTING TEST REPORT — 55 SOS SCENARIOS")
    print("  " + datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    print("=" * 110)

    total_time = sum(r["elapsed_seconds"] for r in results)
    dept_pass = 0
    dept_fail = 0
    sev_pass = 0
    sev_fail = 0

    # Group by expected department
    groups = {"hospital": [], "police": [], "civil_defense": [], "mixed": []}
    for r in results:
        name = r["scenario"]
        if name.startswith("H"):
            groups["hospital"].append(r)
        elif name.startswith("PL"):
            groups["police"].append(r)
        elif name.startswith("CD"):
            groups["civil_defense"].append(r)
        else:
            groups["mixed"].append(r)

    group_labels = {
        "hospital": "HOSPITAL (Medical)",
        "police": "POLICE (Security)",
        "civil_defense": "CIVIL DEFENSE (Rescue/Fire/Hazmat)",
        "mixed": "MIXED / AMBIGUOUS / EDGE CASES",
    }

    for gkey, gresults in groups.items():
        if not gresults:
            continue
        print(f"\n{'─' * 110}")
        print(f"  {group_labels[gkey]} ({len(gresults)} scenarios)")
        print(f"{'─' * 110}")

        for r in gresults:
            actual_dept = r["actual_department"] or "unknown"
            acceptable = r["acceptable_depts"]
            dept_ok = actual_dept in acceptable if actual_dept != "unknown" else False
            if dept_ok:
                dept_pass += 1
            else:
                dept_fail += 1

            actual_sev = r["actual_severity"] or "unknown"
            exp_sev = r["expected_severity"]
            if actual_sev != "unknown":
                if exp_sev == "critical":
                    sev_ok = actual_sev in ("critical", "high")
                elif exp_sev == "high":
                    sev_ok = actual_sev in ("high", "critical")
                elif exp_sev == "low":
                    sev_ok = actual_sev in ("low", "medium")
                else:
                    sev_ok = actual_sev == exp_sev
                if sev_ok:
                    sev_pass += 1
                else:
                    sev_fail += 1
            else:
                sev_ok = False

            dept_verdict = "PASS" if dept_ok else "FAIL"
            engine = "AI" if r["used_crewai"] else "FB"

            print(f"  [{engine}] {r['scenario']}")
            print(f"       Dept: {actual_dept:<16} expected={r['expected_department']:<16} [{dept_verdict}]")
            print(f"       Sev:  {actual_sev:<16} expected={exp_sev:<16} [{'PASS' if sev_ok else 'FAIL'}]")
            print(f"       Alert: {'Yes' if r['alert_created'] else 'No':<5}  Time: {r['elapsed_seconds']:.1f}s")

    # Summary table
    total = len(results)
    dept_total = dept_pass + dept_fail
    sev_total = sev_pass + sev_fail
    dept_pct = (dept_pass / dept_total * 100) if dept_total > 0 else 0
    sev_pct = (sev_pass / sev_total * 100) if sev_total > 0 else 0

    print(f"\n{'=' * 110}")
    print("  SUMMARY")
    print(f"{'=' * 110}")
    print(f"  Total scenarios:        {total}")
    print(f"  Total time:             {total_time:.1f}s (avg {total_time/total:.1f}s/scenario)")
    print(f"")
    print(f"  Department routing:     {dept_pass}/{dept_total} correct ({dept_pct:.1f}%)")
    print(f"  Severity accuracy:      {sev_pass}/{sev_total} correct ({sev_pct:.1f}%)")
    print(f"")

    if dept_pct >= 80:
        print(f"  DEPARTMENT ROUTING: PASS (>= 80% threshold)")
    else:
        print(f"  DEPARTMENT ROUTING: FAIL (< 80% threshold — {dept_pct:.1f}%)")

    print(f"\n{'=' * 110}")

    # Per-department breakdown
    print(f"\n  Per-Department Breakdown:")
    for gkey, gresults in groups.items():
        if not gresults:
            continue
        g_pass = sum(1 for r in gresults if (r["actual_department"] or "unknown") in r["acceptable_depts"])
        g_pct = g_pass / len(gresults) * 100 if gresults else 0
        print(f"    {group_labels[gkey]}: {g_pass}/{len(gresults)} ({g_pct:.0f}%)")

    print(f"\n{'=' * 110}\n")

    return dept_pct


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def run_fast_classification_test():
    """Fast test: directly validate _classify_department_from_message on all scenarios.

    No DB, no LLM, no alert creation — pure keyword-based classification.
    """
    from tasks.sos_tasks import _classify_department_from_message

    print(f"\n{'=' * 110}")
    print(f"  FAST DEPARTMENT CLASSIFICATION TEST — {len(TEST_SCENARIOS)} scenarios (keyword-based)")
    print(f"  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'=' * 110}\n")

    results = []
    for i, scenario in enumerate(TEST_SCENARIOS):
        message = scenario.get("message", "")
        patient_status = scenario.get("patient_status", "safe")
        acceptable = scenario.get("acceptable_depts", [scenario["expected_department"]])

        start_time = time.time()
        actual_dept = _classify_department_from_message(message, patient_status)
        elapsed = time.time() - start_time

        results.append({
            "scenario": scenario["name"],
            "expected_department": scenario["expected_department"],
            "acceptable_depts": acceptable,
            "expected_severity": scenario["expected_severity"],
            "actual_department": actual_dept,
            "actual_severity": None,
            "alert_created": False,
            "elapsed_seconds": round(elapsed, 4),
            "used_crewai": False,
            "raw_result": {"classification": actual_dept},
        })

        dept_ok = actual_dept in acceptable
        print(f"  [{i+1}/{len(TEST_SCENARIOS)}] {scenario['name']}")
        print(f"       → {actual_dept:<16} expected={scenario['expected_department']:<16} [{'OK' if dept_ok else 'MISS'}]")

    accuracy = print_report(results)
    return accuracy


async def run_full_integration_test():
    """Full test: runs through DB + LLM (CrewAI or fallback) pipeline."""
    print(f"\n[1/3] Setting up {len(TEST_PATIENTS)} test patients...")
    await setup_test_patients()

    final_ids = []
    for tp in TEST_PATIENTS:
        pid = await get_patient_id_by_phone(tp["phone"])
        final_ids.append(pid)
        print(f"  {tp['name'][:50]}: {pid}")

    print(f"\n[2/3] Running {len(TEST_SCENARIOS)} department routing scenarios...")
    print("  (0.5s delay between scenarios)\n")

    results = []
    for i, scenario in enumerate(TEST_SCENARIOS):
        print(f"  [{i+1}/{len(TEST_SCENARIOS)}] {scenario['name']}...", end="", flush=True)
        try:
            r = await run_scenario(scenario, final_ids)
            dept_ok = (r["actual_department"] or "unknown") in r["acceptable_depts"]
            print(f" dept={r['actual_department'] or '?'} [{'OK' if dept_ok else 'MISS'}] ({r['elapsed_seconds']:.1f}s)")
            results.append(r)
        except Exception as e:
            print(f" ERROR: {e}")
            results.append({
                "scenario": scenario["name"],
                "expected_department": scenario["expected_department"],
                "acceptable_depts": scenario.get("acceptable_depts", [scenario["expected_department"]]),
                "expected_severity": scenario["expected_severity"],
                "actual_department": None,
                "actual_severity": None,
                "alert_created": False,
                "elapsed_seconds": 0,
                "used_crewai": False,
                "raw_result": {"error": str(e)},
            })

        # Brief delay between scenarios
        if i < len(TEST_SCENARIOS) - 1:
            await asyncio.sleep(0.5)

    print(f"\n[3/3] Generating report...")
    accuracy = print_report(results)
    return accuracy


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "fast"

    if mode == "fast":
        accuracy = run_fast_classification_test()
    elif mode == "full":
        accuracy = asyncio.run(run_full_integration_test())
    else:
        print(f"Usage: python {sys.argv[0]} [fast|full]")
        print("  fast  — Direct keyword classification test (no DB/LLM, instant)")
        print("  full  — Full integration test with DB + CrewAI/fallback pipeline")
        sys.exit(2)

    if accuracy >= 80:
        print("TEST SUITE PASSED")
        sys.exit(0)
    else:
        print(f"TEST SUITE FAILED — {accuracy:.1f}% < 80% threshold")
        sys.exit(1)
