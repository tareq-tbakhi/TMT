"""
Seed script — creates facilities, admin users, 310 patients with full medical
profiles, 60 SOS requests, and 60 matching alerts across all three departments.

Run inside the backend container:
    docker exec tmt-backend python seed.py
"""
import asyncio
import random
import uuid
from datetime import datetime, date, timedelta

from sqlalchemy import func as sa_func

from app.db.postgres import engine, Base, async_session
from app.models.user import User, UserRole
from app.models.hospital import Hospital, HospitalStatus, DepartmentType
from app.models.patient import Patient, MobilityStatus, LivingSituation, Gender, RiskLevel
from app.models.sos_request import SosRequest, SOSStatus, PatientStatus, SOSSource
from app.models.alert import Alert, AlertSeverity, EventType
from app.api.middleware.auth import hash_password

random.seed(42)

# ─────────────────────────────────────────────────────────────────────
#  Reference data arrays
# ─────────────────────────────────────────────────────────────────────

MALE_FIRST = [
    "Ahmad", "Mohammed", "Omar", "Khaled", "Yusuf", "Ibrahim", "Hassan",
    "Ali", "Sami", "Fadi", "Tariq", "Rami", "Bilal", "Wael", "Issa",
    "Mahmoud", "Suleiman", "Mazen", "Amjad", "Hisham", "Nidal", "Saeed",
    "Jamal", "Ziad", "Bassam", "Imad", "Rafiq", "Nasser", "Kamal", "Adel",
    "Munir", "Tawfiq", "Raed", "Hamza", "Yousef", "Ayman", "Shadi",
    "Marwan", "Walid", "Faris", "Ashraf", "Ghassan", "Jihad", "Salah",
    "Mohannad", "Hazem", "Tamer", "Osama", "Samir", "Mustafa",
]
FEMALE_FIRST = [
    "Fatima", "Mariam", "Nour", "Salma", "Hala", "Dalia", "Reem",
    "Samia", "Mona", "Jana", "Lina", "Lubna", "Sara", "Wafa", "Huda",
    "Rania", "Amal", "Nadia", "Layla", "Dina", "Haneen", "Aya", "Yasmin",
    "Abeer", "Rana", "Tamara", "Asma", "Ghada", "Sahar", "Nisreen",
    "Iman", "Majda", "Siham", "Lamis", "Suha", "Dalal", "Nawal",
    "Sana", "Maysoon", "Sawsan", "Taghreed", "Ibtisam", "Amira",
    "Jumana", "Khadija", "Bushra", "Hanan", "Manal", "Najwa", "Samira",
]
FAMILY_NAMES = [
    "Al-Masri", "Abed", "Nasser", "Qassem", "Darwish", "Saleh",
    "Abu-Rida", "Khalil", "Hamdan", "Mansour", "Barhoum", "Shahin",
    "Odeh", "Atallah", "Hamad", "Zaqout", "Harb", "Yassin", "Taha",
    "Khatib", "Jaber", "Madhoun", "Shurrab", "Afana", "Shawa",
    "Abu-Hammad", "Shalabi", "Qudaih", "Shaheen", "Nassar", "Helles",
    "Abu-Amra", "Saqallah", "Matar", "Habboush", "Daghmash",
    "Al-Rantisi", "Shamali", "Bakr", "Abu-Hasira", "Moshtaha",
    "Al-Ghoul", "Zorob", "Al-Hindi", "Fayyad", "Swairki", "Abu-Nada",
    "Isleem", "Abu-Jazar", "Duheir",
]
BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]
BLOOD_WEIGHTS = [38, 7, 27, 6, 12, 3, 5, 2]  # realistic distribution

GAZA_NEIGHBORHOODS = [
    ("Rimal", 31.517, 34.438), ("Tal al-Hawa", 31.510, 34.440),
    ("Shujaiyya", 31.512, 34.450), ("Zeitoun", 31.508, 34.442),
    ("Sabra", 31.505, 34.438), ("Daraj", 31.515, 34.436),
    ("Tuffah", 31.520, 34.445), ("Sheikh Radwan", 31.525, 34.440),
    ("Nasser", 31.503, 34.435), ("Beach Camp", 31.530, 34.430),
    ("Jabalia", 31.535, 34.498), ("Beit Lahiya", 31.555, 34.505),
    ("Beit Hanoun", 31.543, 34.534), ("Deir al-Balah", 31.420, 34.350),
    ("Nuseirat", 31.440, 34.385), ("Bureij", 31.451, 34.390),
    ("Maghazi", 31.435, 34.370), ("Khan Younis City", 31.346, 34.306),
    ("Bani Suheila", 31.350, 34.320), ("Abasan", 31.345, 34.335),
    ("Rafah City", 31.295, 34.250), ("Yibna Camp", 31.298, 34.255),
    ("Tal al-Sultan", 31.290, 34.245), ("Khuza'a", 31.360, 34.340),
]

WEST_BANK_NEIGHBORHOODS = [
    ("Ramallah Center", 31.9038, 35.2034), ("Al-Bireh", 31.9100, 35.2150),
    ("Ein Minjed", 31.8980, 35.1950), ("Al-Tireh", 31.9150, 35.1980),
    ("Nablus Old City", 32.2211, 35.2544), ("Rafidia", 32.2250, 35.2400),
    ("Balata Camp", 32.2180, 35.2650), ("Askar Camp", 32.2280, 35.2700),
    ("Hebron Old City", 31.5243, 35.1105), ("Wadi al-Hariye", 31.5300, 35.1050),
    ("Bab al-Zawiye", 31.5260, 35.1070), ("Halhul", 31.5830, 35.0960),
    ("Jenin City", 32.4600, 35.3000), ("Jenin Camp", 32.4620, 35.2950),
    ("Bethlehem Center", 31.7054, 35.2024), ("Beit Sahour", 31.7050, 35.2260),
    ("Tulkarem City", 32.3107, 35.0294), ("Tulkarem Camp", 32.3080, 35.0250),
    ("Jericho Center", 31.8610, 35.4607), ("Ein al-Sultan", 31.8700, 35.4500),
]

# Chronic conditions by category
HOSPITAL_CONDITIONS = [
    ["diabetes_type2", "hypertension"], ["diabetes_type1"],
    ["asthma", "copd"], ["heart_failure", "atrial_fibrillation"],
    ["chronic_kidney_disease"], ["epilepsy"],
    ["breast_cancer", "anemia"], ["liver_cirrhosis"],
    ["rheumatoid_arthritis"], ["sickle_cell_disease"],
    ["multiple_sclerosis"], ["lupus"],
    ["hemophilia"], ["thalassemia"],
    ["tuberculosis"], ["hepatitis_b"],
    ["congestive_heart_failure", "diabetes_type2"],
    ["hypothyroidism", "hypertension"],
    ["crohns_disease"], ["cystic_fibrosis"],
]
POLICE_CONDITIONS = [
    ["ptsd"], ["anxiety_disorder", "ptsd"],
    ["post_concussion_syndrome"], ["chronic_pain"],
    ["ptsd", "insomnia"], ["depression"],
    ["stab_wound_recovery"], ["gunshot_wound_recovery"],
    ["facial_fracture_healing"], ["spinal_injury_partial"],
    [], [], [], [], [],  # many crime victims are otherwise healthy
]
CD_CONDITIONS = [
    ["multiple_fractures", "crush_injury"], ["second_degree_burns"],
    ["smoke_inhalation", "reactive_airway_disease"],
    ["spinal_cord_injury"], ["below_knee_amputation"],
    ["traumatic_brain_injury"], ["chemical_burns"],
    ["hypothermia_recovered", "pneumonia"],
    ["blast_injury", "hearing_loss"], ["third_degree_burns"],
    ["fractured_pelvis"], ["compartment_syndrome"],
    [], [], [],  # some are displaced but physically fine
]

COMMON_ALLERGIES = [
    "penicillin", "sulfa_drugs", "aspirin", "ibuprofen", "nsaids",
    "latex", "morphine", "codeine", "tetracycline", "iodine_contrast",
    "peanuts", "shellfish", "dust", "bee_stings", "ace_inhibitors",
    "chlorine", "silver_sulfadiazine",
]
COMMON_MEDICATIONS = {
    "diabetes": ["metformin_500mg", "insulin_glargine", "glipizide"],
    "hypertension": ["lisinopril_10mg", "amlodipine_5mg", "losartan_50mg"],
    "asthma": ["albuterol_inhaler", "fluticasone_inhaler", "montelukast"],
    "cardiac": ["warfarin", "digoxin", "furosemide", "atorvastatin"],
    "pain": ["acetaminophen", "gabapentin", "tramadol"],
    "psychiatric": ["sertraline_50mg", "prazosin", "trazodone", "escitalopram"],
    "antibiotic": ["amoxicillin", "ceftriaxone", "azithromycin"],
    "general": ["vitamin_d", "iron_supplement", "calcium_supplement", "omeprazole"],
}
EQUIPMENT = [
    "oxygen_tank", "oxygen_concentrator", "wheelchair", "crutches",
    "hospital_bed", "nebulizer", "insulin_pump", "glucose_monitor",
    "blood_pressure_monitor", "pacemaker", "hearing_aid", "prosthetic_leg",
    "back_brace", "cpap_machine", "walker", "catheter",
]
RELATION_TYPES = ["mother", "father", "wife", "husband", "son", "daughter",
                  "brother", "sister", "uncle", "aunt", "neighbor", "friend"]
INSURANCE = [
    "UNRWA Health Coverage", "Palestinian MoH Insurance", "WHO Emergency Fund",
    "ICRC Medical Aid", "MSF Patient Program", "Private - Palestine Insurance Co.",
    "Private - Trust Insurance", None, None, None,  # some have no insurance
]

# SOS message templates per department
HOSPITAL_SOS_MSGS = [
    "My {condition} is getting worse, I need immediate medical attention",
    "I am having severe chest pain and difficulty breathing",
    "My blood sugar is dangerously {high_low}, I need help urgently",
    "I fell and I think I broke my {bone}, I cannot move",
    "My child has a very high fever and is having seizures",
    "I am bleeding heavily and cannot stop it",
    "I am having an asthma attack and my inhaler is not working",
    "My wound is infected and I have a high fever",
    "I am a dialysis patient and missed my last 2 sessions, feeling very sick",
    "I am pregnant and having severe contractions, the baby is coming early",
    "My father collapsed and is not responding, please send help",
    "I need my medications urgently, I have been without them for 3 days",
    "I am having severe allergic reaction, my throat is swelling",
    "I was in an accident and have deep cuts on my arms and legs",
    "My mother's oxygen tank is almost empty, she cannot breathe without it",
    "I have severe abdominal pain and have been vomiting blood",
    "My insulin pump stopped working and my sugar is dropping fast",
    "I think I am having a stroke, my face feels numb and I cannot speak well",
    "The wound from my surgery is reopening and there is pus coming out",
    "My child ate something and is not breathing properly, choking",
]
POLICE_SOS_MSGS = [
    "Someone broke into my house and stole everything, I am scared they will come back",
    "I witnessed a shooting near my neighborhood, people are injured",
    "There are armed men threatening people in our street",
    "My neighbor is being beaten, I can hear screaming, please send help",
    "Someone is following me and I feel threatened, I need protection",
    "There was a robbery at the market, the thieves had knives",
    "A fight broke out between families, weapons are involved",
    "Someone stole my car at gunpoint, I am injured",
    "I found suspicious items near the school, could be dangerous",
    "My ex-husband is threatening to kill me, he is outside my door",
    "There is a kidnapping happening on our street right now",
    "People are looting shops in our area, it is very dangerous",
    "I was assaulted walking home, I am bleeding and scared",
    "Armed men are setting up a checkpoint on our road",
    "My son was taken by unknown men, please help find him",
    "There are gunshots near the hospital, patients are in danger",
    "Someone threw a firebomb at our shop, we need immediate help",
    "I am being blackmailed and threatened with violence",
    "A woman is screaming for help in the building next to us",
    "There is a standoff with armed men near the school, children are inside",
]
CD_SOS_MSGS = [
    "Our building was hit and is collapsing, people are trapped inside",
    "There is a massive fire in our building, we cannot get out",
    "Our neighborhood is flooding, water is rising fast in our house",
    "A gas explosion happened in our kitchen, my family is injured",
    "The building next to us collapsed and dust is everywhere, people are screaming",
    "We are trapped under rubble after the bombing, please send rescue teams",
    "There is a chemical smell and people are getting sick in our area",
    "An electrical fire started and is spreading to other apartments",
    "The road collapsed and cars fell in, people are trapped",
    "A wall fell on my neighbor's house, they are trapped inside",
    "There is an unexploded bomb near our house, we need evacuation",
    "Sewage is flooding our street, it is reaching the houses and is dangerous",
    "The stairway collapsed in our building, families are stuck on upper floors",
    "A crane fell on buildings during the storm, people are trapped",
    "Our shelter is collapsing from the rain, 20 families are here",
    "Fire broke out in the refugee camp, many tents are burning",
    "Landslide near our area, several houses are at risk",
    "Power lines are down and sparking, very dangerous for children",
    "Building is cracking and tilting, we need emergency evacuation now",
    "Explosion in the factory nearby, smoke everywhere, hard to breathe",
]


def _make_point(lon, lat):
    return sa_func.ST_SetSRID(sa_func.ST_MakePoint(lon, lat), 4326)


def _jitter(base, spread=0.008):
    """Add small random jitter to a coordinate."""
    return base + random.uniform(-spread, spread)


def _rand_dob(min_age, max_age):
    """Random date of birth for someone between min_age and max_age."""
    days_ago = random.randint(min_age * 365, max_age * 365)
    return (datetime.now() - timedelta(days=days_ago)).date()


def _rand_blood():
    return random.choices(BLOOD_TYPES, weights=BLOOD_WEIGHTS, k=1)[0]


def _rand_allergies(max_n=3):
    n = random.choices([0, 0, 0, 1, 1, 2, 3], k=1)[0]
    return random.sample(COMMON_ALLERGIES, min(n, max_n))


def _rand_medications(conditions):
    meds = []
    for c in conditions:
        for key, med_list in COMMON_MEDICATIONS.items():
            if key in c.lower():
                meds.append(random.choice(med_list))
    if not meds and random.random() < 0.3:
        meds = random.sample(COMMON_MEDICATIONS["general"], random.randint(1, 2))
    return list(set(meds))


def _rand_equipment(conditions, mobility):
    eq = []
    if mobility == MobilityStatus.WHEELCHAIR:
        eq.append("wheelchair")
    if mobility == MobilityStatus.BEDRIDDEN:
        eq.extend(["hospital_bed"])
    for c in conditions:
        if "asthma" in c or "copd" in c or "smoke" in c:
            eq.append(random.choice(["nebulizer", "oxygen_concentrator"]))
        if "diabetes" in c and random.random() < 0.4:
            eq.extend(["insulin_pump", "glucose_monitor"])
        if "heart" in c or "cardiac" in c:
            eq.append("blood_pressure_monitor")
    if random.random() < 0.1:
        eq.append(random.choice(["cpap_machine", "walker", "back_brace"]))
    return list(set(eq))


def _rand_contacts(family_name, gender):
    n = random.randint(1, 3)
    contacts = []
    used_relations = set()
    for _ in range(n):
        rel = random.choice(RELATION_TYPES)
        while rel in used_relations:
            rel = random.choice(RELATION_TYPES)
        used_relations.add(rel)
        if rel in ("mother", "wife", "daughter", "sister", "aunt"):
            cname = random.choice(FEMALE_FIRST) + " " + family_name
        else:
            cname = random.choice(MALE_FIRST) + " " + family_name
        contacts.append({
            "name": cname,
            "phone": f"059{random.randint(1000000, 9999999)}",
            "relation": rel,
        })
    return contacts


def _patient_notes(category, conditions):
    notes_map = {
        "elderly_medical": "Elderly patient requiring regular medical monitoring. Limited mobility.",
        "child_medical": "Pediatric patient. Parent/guardian must be present for all treatments.",
        "pregnant": "Obstetric patient. Regular prenatal checkups required.",
        "trauma": "Trauma patient. Follow-up care and rehabilitation ongoing.",
        "crime_victim": "Crime victim. May need psychological support. Handle with sensitivity.",
        "displaced": "Internally displaced person. Shelter and basic needs may be required.",
        "general": None,
    }
    base = notes_map.get(category)
    if conditions and base:
        return f"{base} Active conditions: {', '.join(conditions[:3])}."
    return base


def generate_patient(idx, category, neighborhoods=None, region="Gaza Strip"):
    """Generate a single patient dict for the given category."""
    is_female = random.random() < 0.52  # slight female majority
    first = random.choice(FEMALE_FIRST if is_female else MALE_FIRST)
    family = random.choice(FAMILY_NAMES)
    name = f"{first} {family}"
    phone = f"05991{idx:05d}"

    # Age ranges by category
    age_ranges = {
        "elderly_medical": (60, 90),
        "child_medical": (1, 14),
        "pregnant": (18, 40),
        "trauma": (15, 55),
        "crime_victim": (16, 60),
        "displaced": (5, 75),
        "general": (1, 85),
    }
    min_age, max_age = age_ranges.get(category, (1, 85))
    dob = _rand_dob(min_age, max_age)

    # Override gender for pregnant
    if category == "pregnant":
        is_female = True
        first = random.choice(FEMALE_FIRST)
        name = f"{first} {family}"

    gender = Gender.FEMALE if is_female else Gender.MALE

    # Location — pick a neighborhood
    hoods = neighborhoods or GAZA_NEIGHBORHOODS
    hood = random.choice(hoods)
    lat = _jitter(hood[1])
    lon = _jitter(hood[2])

    # Mobility
    if category == "elderly_medical":
        mobility = random.choices(
            [MobilityStatus.BEDRIDDEN, MobilityStatus.WHEELCHAIR, MobilityStatus.CAN_WALK],
            weights=[30, 35, 35], k=1
        )[0]
    elif category in ("trauma", "crime_victim"):
        mobility = random.choices(
            [MobilityStatus.BEDRIDDEN, MobilityStatus.WHEELCHAIR, MobilityStatus.CAN_WALK],
            weights=[20, 25, 55], k=1
        )[0]
    elif category == "child_medical":
        mobility = random.choices(
            [MobilityStatus.BEDRIDDEN, MobilityStatus.CAN_WALK],
            weights=[15, 85], k=1
        )[0]
    else:
        mobility = random.choices(
            [MobilityStatus.BEDRIDDEN, MobilityStatus.WHEELCHAIR, MobilityStatus.CAN_WALK],
            weights=[5, 10, 85], k=1
        )[0]

    # Living situation
    if category == "elderly_medical":
        living = random.choices(
            [LivingSituation.ALONE, LivingSituation.WITH_FAMILY, LivingSituation.CARE_FACILITY],
            weights=[35, 45, 20], k=1
        )[0]
    elif category in ("child_medical", "pregnant"):
        living = LivingSituation.WITH_FAMILY
    elif category == "displaced":
        living = random.choices(
            [LivingSituation.ALONE, LivingSituation.WITH_FAMILY, LivingSituation.CARE_FACILITY],
            weights=[30, 40, 30], k=1
        )[0]
    else:
        living = random.choices(
            [LivingSituation.ALONE, LivingSituation.WITH_FAMILY],
            weights=[30, 70], k=1
        )[0]

    # Conditions by category
    if category == "elderly_medical":
        conditions = list(random.choice(HOSPITAL_CONDITIONS))
        if random.random() < 0.5:
            conditions.append(random.choice(["osteoporosis", "cataracts", "dementia", "arthritis"]))
    elif category == "child_medical":
        conditions = list(random.choice([
            ["severe_asthma"], ["diabetes_type1"], ["epilepsy"],
            ["sickle_cell_disease"], ["thalassemia"], ["congenital_heart_defect"],
            ["cerebral_palsy"], ["cystic_fibrosis"], ["leukemia"],
        ]))
    elif category == "pregnant":
        conditions = ["pregnancy"]
        if random.random() < 0.3:
            conditions.append("gestational_diabetes")
        if random.random() < 0.2:
            conditions.append("preeclampsia")
        if random.random() < 0.15:
            conditions.append("anemia")
    elif category == "trauma":
        conditions = list(random.choice(CD_CONDITIONS))
    elif category == "crime_victim":
        conditions = list(random.choice(POLICE_CONDITIONS))
    elif category == "displaced":
        if random.random() < 0.4:
            conditions = list(random.choice([
                ["malnutrition"], ["dehydration"], ["ptsd"],
                ["skin_infection"], ["respiratory_infection"],
                ["diarrheal_disease"], ["scabies"], ["anemia"],
            ]))
        else:
            conditions = []
    else:  # general
        if random.random() < 0.4:
            conditions = list(random.choice(HOSPITAL_CONDITIONS + [[], [], [], [], []]))
        else:
            conditions = []

    blood = _rand_blood()
    allergies = _rand_allergies()
    meds = _rand_medications(conditions)
    equip = _rand_equipment(conditions, mobility)
    contacts = _rand_contacts(family, gender)
    notes = _patient_notes(category, conditions)

    # Height/weight based on age
    age = (datetime.now().date() - dob).days // 365
    if age < 2:
        height = random.uniform(50, 85)
        weight = random.uniform(3, 12)
    elif age < 14:
        height = random.uniform(80, 160)
        weight = random.uniform(12, 50)
    elif is_female:
        height = random.uniform(150, 175)
        weight = random.uniform(45, 85)
    else:
        height = random.uniform(160, 190)
        weight = random.uniform(55, 110)

    insurance = random.choice(INSURANCE)

    # National ID (some may not have it — children, displaced)
    national_id = None
    if age >= 16 and random.random() < 0.85:
        national_id = f"4{random.randint(10000000, 99999999)}"

    # Trust / risk scores
    trust = round(random.uniform(0.6, 1.0), 2)
    risk = 0.0
    risk_level = RiskLevel.LOW
    if category == "elderly_medical":
        risk = round(random.uniform(40, 85), 1)
        risk_level = RiskLevel.HIGH if risk >= 60 else RiskLevel.MODERATE
    elif category in ("child_medical", "pregnant"):
        risk = round(random.uniform(25, 65), 1)
        risk_level = RiskLevel.HIGH if risk >= 55 else RiskLevel.MODERATE
    elif category in ("trauma", "crime_victim"):
        risk = round(random.uniform(15, 70), 1)
        risk_level = RiskLevel.HIGH if risk >= 60 else RiskLevel.MODERATE if risk >= 35 else RiskLevel.LOW
    elif category == "displaced":
        risk = round(random.uniform(20, 55), 1)
        risk_level = RiskLevel.MODERATE if risk >= 35 else RiskLevel.LOW

    return {
        "phone": phone,
        "name": name,
        "dob": dob,
        "gender": gender,
        "national_id": national_id,
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "location_name": f"{hood[0]}, {region}",
        "mobility": mobility,
        "living": living,
        "blood": blood,
        "height_cm": round(height, 1),
        "weight_kg": round(weight, 1),
        "conditions": conditions,
        "allergies": allergies,
        "medications": meds,
        "equipment": equip,
        "contacts": contacts,
        "insurance": insurance,
        "notes": notes,
        "trust_score": trust,
        "risk_score": risk,
        "risk_level": risk_level,
        "category": category,
        "family": family,
    }


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # ==============================================================
        #  TRUNCATE ALL TABLES (clean slate)
        # ==============================================================
        from sqlalchemy import text
        await db.execute(text(
            "TRUNCATE geo_events, alerts, sos_requests, patients, users, hospitals "
            "RESTART IDENTITY CASCADE"
        ))
        await db.flush()

        # ==============================================================
        #  FACILITIES — 3 per department (9 total)
        # ==============================================================

        # Hospitals
        h1_id, h2_id, h3_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        hospitals = [
            Hospital(
                id=h1_id, name="Al-Shifa Medical Complex",
                department_type=DepartmentType.HOSPITAL,
                latitude=31.5195, longitude=34.4382,
                location=_make_point(34.4382, 31.5195),
                status=HospitalStatus.OPERATIONAL,
                bed_capacity=500, icu_beds=40, available_beds=120,
                specialties=["trauma", "surgery", "pediatrics", "emergency", "obstetrics", "cardiology"],
                coverage_radius_km=20.0,
                phone="+970-8-2861111", email="info@alshifa.ps",
                address="Al-Rimal, Gaza City", website="https://alshifa.ps",
                supply_levels={"blood": 60, "medications": 45, "oxygen": 70, "surgical": 50, "iv_fluids": 55, "antibiotics": 40},
            ),
            Hospital(
                id=h2_id, name="European Gaza Hospital",
                department_type=DepartmentType.HOSPITAL,
                latitude=31.3225, longitude=34.3100,
                location=_make_point(34.3100, 31.3225),
                status=HospitalStatus.LIMITED,
                bed_capacity=250, icu_beds=20, available_beds=30,
                specialties=["trauma", "orthopedics", "internal_medicine", "dialysis"],
                coverage_radius_km=15.0,
                phone="+970-8-2641111", email="info@egh.ps",
                address="Khan Younis", website="https://egh.ps",
                supply_levels={"blood": 30, "medications": 25, "oxygen": 40, "surgical": 20, "iv_fluids": 35, "antibiotics": 28},
            ),
            Hospital(
                id=h3_id, name="Al-Aqsa Martyrs Hospital",
                department_type=DepartmentType.HOSPITAL,
                latitude=31.4200, longitude=34.3500,
                location=_make_point(34.3500, 31.4200),
                status=HospitalStatus.OPERATIONAL,
                bed_capacity=180, icu_beds=12, available_beds=45,
                specialties=["emergency", "surgery", "pediatrics", "maternity"],
                coverage_radius_km=12.0,
                phone="+970-8-2531111", email="info@alaqsa-hospital.ps",
                address="Deir al-Balah", website="https://alaqsa-hospital.ps",
                supply_levels={"blood": 50, "medications": 38, "oxygen": 55, "surgical": 42, "iv_fluids": 48, "antibiotics": 35},
            ),
        ]

        # Police Stations
        ps1_id, ps2_id, ps3_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        police = [
            Hospital(
                id=ps1_id, name="Gaza City Central Police Station",
                department_type=DepartmentType.POLICE,
                latitude=31.5150, longitude=34.4400,
                location=_make_point(34.4400, 31.5150),
                status=HospitalStatus.OPERATIONAL,
                patrol_units=12, available_units=8,
                jurisdiction_area="Gaza City — Northern District",
                coverage_radius_km=15.0,
                phone="+970-8-2820100", email="central@police.ps",
                address="Omar Al-Mukhtar St, Gaza City", website="https://police.ps",
                supply_levels={"ammunition": 65, "fuel": 50, "communication_equipment": 80, "protective_gear": 70, "vehicles": 60},
            ),
            Hospital(
                id=ps2_id, name="Khan Younis Police Station",
                department_type=DepartmentType.POLICE,
                latitude=31.3460, longitude=34.3060,
                location=_make_point(34.3060, 31.3460),
                status=HospitalStatus.LIMITED,
                patrol_units=8, available_units=3,
                jurisdiction_area="Khan Younis — Southern Zone",
                coverage_radius_km=12.0,
                phone="+970-8-2050200", email="khanyounis@police.ps",
                address="Main St, Khan Younis",
                supply_levels={"ammunition": 40, "fuel": 30, "communication_equipment": 55, "protective_gear": 45, "vehicles": 35},
            ),
            Hospital(
                id=ps3_id, name="Deir al-Balah Police Station",
                department_type=DepartmentType.POLICE,
                latitude=31.4180, longitude=34.3520,
                location=_make_point(34.3520, 31.4180),
                status=HospitalStatus.OPERATIONAL,
                patrol_units=6, available_units=5,
                jurisdiction_area="Deir al-Balah — Central Zone",
                coverage_radius_km=10.0,
                phone="+970-8-2530100", email="deirbalah@police.ps",
                address="Central Rd, Deir al-Balah",
                supply_levels={"ammunition": 55, "fuel": 60, "communication_equipment": 70, "protective_gear": 60, "vehicles": 50},
            ),
        ]

        # Civil Defense Centers
        cd1_id, cd2_id, cd3_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        civil_defense = [
            Hospital(
                id=cd1_id, name="Gaza Civil Defense HQ",
                department_type=DepartmentType.CIVIL_DEFENSE,
                latitude=31.5220, longitude=34.4350,
                location=_make_point(34.4350, 31.5220),
                status=HospitalStatus.OPERATIONAL,
                rescue_teams=6, available_teams=4,
                equipment_types=["fire_truck", "ambulance", "crane", "hazmat_unit", "search_and_rescue", "water_tanker"],
                shelter_capacity=500, coverage_radius_km=20.0,
                phone="+970-8-2821999", email="hq@civildefense.ps",
                address="Al-Nasser St, Gaza City", website="https://civildefense.ps",
                supply_levels={"fuel": 55, "rescue_equipment": 60, "fire_suppression": 70, "medical_kits": 45, "protective_gear": 65, "water": 50, "food": 40},
            ),
            Hospital(
                id=cd2_id, name="Rafah Civil Defense Station",
                department_type=DepartmentType.CIVIL_DEFENSE,
                latitude=31.2900, longitude=34.2500,
                location=_make_point(34.2500, 31.2900),
                status=HospitalStatus.LIMITED,
                rescue_teams=3, available_teams=2,
                equipment_types=["fire_truck", "ambulance", "search_and_rescue"],
                shelter_capacity=200, coverage_radius_km=10.0,
                phone="+970-8-2131999", email="rafah@civildefense.ps",
                address="Main Rd, Rafah",
                supply_levels={"fuel": 35, "rescue_equipment": 40, "fire_suppression": 45, "medical_kits": 30, "protective_gear": 40, "water": 55, "food": 50},
            ),
            Hospital(
                id=cd3_id, name="Central Gaza Civil Defense",
                department_type=DepartmentType.CIVIL_DEFENSE,
                latitude=31.4350, longitude=34.3700,
                location=_make_point(34.3700, 31.4350),
                status=HospitalStatus.OPERATIONAL,
                rescue_teams=4, available_teams=3,
                equipment_types=["fire_truck", "ambulance", "crane", "search_and_rescue", "generator"],
                shelter_capacity=350, coverage_radius_km=15.0,
                phone="+970-8-2531999", email="central@civildefense.ps",
                address="Salah al-Din Rd, Nuseirat",
                supply_levels={"fuel": 50, "rescue_equipment": 55, "fire_suppression": 60, "medical_kits": 40, "protective_gear": 55, "water": 45, "food": 35},
            ),
        ]

        # West Bank Hospitals
        wh1_id, wh2_id = uuid.uuid4(), uuid.uuid4()
        wb_hospitals = [
            Hospital(
                id=wh1_id, name="Palestine Medical Complex",
                department_type=DepartmentType.HOSPITAL,
                latitude=31.9050, longitude=35.2060,
                location=_make_point(35.2060, 31.9050),
                status=HospitalStatus.OPERATIONAL,
                bed_capacity=350, icu_beds=28, available_beds=80,
                specialties=["trauma", "surgery", "cardiology", "oncology", "emergency", "neurology"],
                coverage_radius_km=25.0,
                phone="+970-2-2986420", email="info@pmc.ps",
                address="Ein Minjed, Ramallah", website="https://pmc.ps",
                supply_levels={"blood": 70, "medications": 60, "oxygen": 75, "surgical": 65, "iv_fluids": 60, "antibiotics": 55},
            ),
            Hospital(
                id=wh2_id, name="Rafidia Hospital",
                department_type=DepartmentType.HOSPITAL,
                latitude=32.2250, longitude=35.2410,
                location=_make_point(35.2410, 32.2250),
                status=HospitalStatus.OPERATIONAL,
                bed_capacity=220, icu_beds=16, available_beds=55,
                specialties=["trauma", "orthopedics", "emergency", "pediatrics", "internal_medicine"],
                coverage_radius_km=20.0,
                phone="+970-9-2390390", email="info@rafidia.ps",
                address="Rafidia, Nablus", website="https://rafidia.ps",
                supply_levels={"blood": 55, "medications": 50, "oxygen": 60, "surgical": 48, "iv_fluids": 52, "antibiotics": 45},
            ),
        ]

        # West Bank Police Stations
        wps1_id, wps2_id = uuid.uuid4(), uuid.uuid4()
        wb_police = [
            Hospital(
                id=wps1_id, name="Ramallah Police Headquarters",
                department_type=DepartmentType.POLICE,
                latitude=31.9020, longitude=35.2000,
                location=_make_point(35.2000, 31.9020),
                status=HospitalStatus.OPERATIONAL,
                patrol_units=15, available_units=10,
                jurisdiction_area="Ramallah & Al-Bireh Governorate",
                coverage_radius_km=20.0,
                phone="+970-2-2987100", email="ramallah@police.ps",
                address="Al-Masyoun, Ramallah",
                supply_levels={"ammunition": 70, "fuel": 65, "communication_equipment": 85, "protective_gear": 75, "vehicles": 70},
            ),
            Hospital(
                id=wps2_id, name="Hebron Police Station",
                department_type=DepartmentType.POLICE,
                latitude=31.5250, longitude=35.1100,
                location=_make_point(35.1100, 31.5250),
                status=HospitalStatus.OPERATIONAL,
                patrol_units=10, available_units=7,
                jurisdiction_area="Hebron Governorate",
                coverage_radius_km=18.0,
                phone="+970-2-2222100", email="hebron@police.ps",
                address="Wadi al-Hariye, Hebron",
                supply_levels={"ammunition": 60, "fuel": 55, "communication_equipment": 70, "protective_gear": 65, "vehicles": 55},
            ),
        ]

        # West Bank Civil Defense
        wcd1_id, wcd2_id = uuid.uuid4(), uuid.uuid4()
        wb_civil_defense = [
            Hospital(
                id=wcd1_id, name="Ramallah Civil Defense Center",
                department_type=DepartmentType.CIVIL_DEFENSE,
                latitude=31.9080, longitude=35.2100,
                location=_make_point(35.2100, 31.9080),
                status=HospitalStatus.OPERATIONAL,
                rescue_teams=5, available_teams=4,
                equipment_types=["fire_truck", "ambulance", "crane", "search_and_rescue", "hazmat_unit"],
                shelter_capacity=400, coverage_radius_km=22.0,
                phone="+970-2-2987999", email="ramallah@civildefense.ps",
                address="Al-Tireh, Ramallah", website="https://civildefense-wb.ps",
                supply_levels={"fuel": 65, "rescue_equipment": 70, "fire_suppression": 75, "medical_kits": 55, "protective_gear": 70, "water": 60, "food": 50},
            ),
            Hospital(
                id=wcd2_id, name="Nablus Civil Defense Station",
                department_type=DepartmentType.CIVIL_DEFENSE,
                latitude=32.2200, longitude=35.2500,
                location=_make_point(35.2500, 32.2200),
                status=HospitalStatus.OPERATIONAL,
                rescue_teams=4, available_teams=3,
                equipment_types=["fire_truck", "ambulance", "search_and_rescue", "generator"],
                shelter_capacity=300, coverage_radius_km=18.0,
                phone="+970-9-2390999", email="nablus@civildefense.ps",
                address="Old City, Nablus",
                supply_levels={"fuel": 55, "rescue_equipment": 60, "fire_suppression": 65, "medical_kits": 50, "protective_gear": 60, "water": 50, "food": 45},
            ),
        ]

        for fac in hospitals + police + civil_defense + wb_hospitals + wb_police + wb_civil_defense:
            db.add(fac)
        await db.flush()  # Ensure facilities exist before FK references

        # ==============================================================
        #  ADMIN USERS — 1 super + 2 per facility = 19
        # ==============================================================

        db.add(User(
            id=uuid.uuid4(), phone="0599000000", email="superadmin@tmt.ps",
            hashed_password=hash_password("superadmin123"),
            role=UserRole.SUPER_ADMIN, is_active=True,
        ))

        admin_defs = [
            ("0599000001", "admin@alshifa.ps", UserRole.HOSPITAL_ADMIN, h1_id),
            ("0599000002", "admin@egh.ps", UserRole.HOSPITAL_ADMIN, h2_id),
            ("0599000003", "admin@alaqsa.ps", UserRole.HOSPITAL_ADMIN, h3_id),
            ("0599000004", "admin2@alshifa.ps", UserRole.HOSPITAL_ADMIN, h1_id),
            ("0599000005", "admin2@egh.ps", UserRole.HOSPITAL_ADMIN, h2_id),
            ("0599000006", "admin2@alaqsa.ps", UserRole.HOSPITAL_ADMIN, h3_id),
            ("0599000010", "admin@gazapolice.ps", UserRole.POLICE_ADMIN, ps1_id),
            ("0599000011", "admin@kypolice.ps", UserRole.POLICE_ADMIN, ps2_id),
            ("0599000012", "admin@dbpolice.ps", UserRole.POLICE_ADMIN, ps3_id),
            ("0599000013", "admin2@gazapolice.ps", UserRole.POLICE_ADMIN, ps1_id),
            ("0599000014", "admin2@kypolice.ps", UserRole.POLICE_ADMIN, ps2_id),
            ("0599000015", "admin2@dbpolice.ps", UserRole.POLICE_ADMIN, ps3_id),
            ("0599000020", "admin@civildefense.ps", UserRole.CIVIL_DEFENSE_ADMIN, cd1_id),
            ("0599000021", "admin@rafahcd.ps", UserRole.CIVIL_DEFENSE_ADMIN, cd2_id),
            ("0599000022", "admin@centralcd.ps", UserRole.CIVIL_DEFENSE_ADMIN, cd3_id),
            ("0599000023", "admin2@civildefense.ps", UserRole.CIVIL_DEFENSE_ADMIN, cd1_id),
            ("0599000024", "admin2@rafahcd.ps", UserRole.CIVIL_DEFENSE_ADMIN, cd2_id),
            ("0599000025", "admin2@centralcd.ps", UserRole.CIVIL_DEFENSE_ADMIN, cd3_id),
            # West Bank admins
            ("0599000030", "admin@pmc.ps", UserRole.HOSPITAL_ADMIN, wh1_id),
            ("0599000031", "admin@rafidia.ps", UserRole.HOSPITAL_ADMIN, wh2_id),
            ("0599000032", "admin@ramallahpolice.ps", UserRole.POLICE_ADMIN, wps1_id),
            ("0599000033", "admin@hebronpolice.ps", UserRole.POLICE_ADMIN, wps2_id),
            ("0599000034", "admin@ramallahcd.ps", UserRole.CIVIL_DEFENSE_ADMIN, wcd1_id),
            ("0599000035", "admin@nabluscd.ps", UserRole.CIVIL_DEFENSE_ADMIN, wcd2_id),
        ]
        for ph, em, role, fac_id in admin_defs:
            db.add(User(
                id=uuid.uuid4(), phone=ph, email=em,
                hashed_password=hash_password("admin123456"),
                role=role, hospital_id=fac_id, is_active=True,
            ))

        # ==============================================================
        #  PATIENTS — 310 total (programmatic generation)
        # ==============================================================
        #  Category breakdown:
        #    elderly_medical:  35
        #    child_medical:    25
        #    pregnant:         15
        #    trauma:           35  (hospital-relevant injuries)
        #    crime_victim:     35  (police-relevant)
        #    displaced:        30  (civil-defense-relevant)
        #    general:         135  (mixed, healthy, minor conditions)
        # ==============================================================

        GAZA_CATEGORY_COUNTS = [
            ("elderly_medical", 35),
            ("child_medical", 25),
            ("pregnant", 15),
            ("trauma", 35),
            ("crime_victim", 35),
            ("displaced", 30),
            ("general", 135),
        ]

        WB_CATEGORY_COUNTS = [
            ("elderly_medical", 10),
            ("child_medical", 8),
            ("pregnant", 5),
            ("trauma", 12),
            ("crime_victim", 12),
            ("displaced", 8),
            ("general", 35),
        ]

        patient_ids = []  # (pid, category, patient_data)
        idx = 0

        # Gaza patients
        for category, count in GAZA_CATEGORY_COUNTS:
            for _ in range(count):
                p = generate_patient(idx, category, neighborhoods=GAZA_NEIGHBORHOODS, region="Gaza Strip")
                pid = uuid.uuid4()

                consent_at = None
                if random.random() < 0.9:
                    consent_at = datetime.now() - timedelta(days=random.randint(1, 180))

                db.add(Patient(
                    id=pid,
                    phone=p["phone"],
                    name=p["name"],
                    date_of_birth=p["dob"],
                    gender=p["gender"],
                    national_id=p["national_id"],
                    primary_language=random.choice(["ar", "ar", "ar", "ar", "en"]),
                    latitude=p["lat"],
                    longitude=p["lon"],
                    location=_make_point(p["lon"], p["lat"]),
                    location_name=p["location_name"],
                    mobility=p["mobility"],
                    living_situation=p["living"],
                    blood_type=p["blood"],
                    height_cm=p["height_cm"],
                    weight_kg=p["weight_kg"],
                    chronic_conditions=p["conditions"],
                    allergies=p["allergies"],
                    current_medications=p["medications"],
                    special_equipment=p["equipment"],
                    emergency_contacts=p["contacts"],
                    insurance_info=p["insurance"],
                    notes=p["notes"],
                    trust_score=p["trust_score"],
                    risk_score=p["risk_score"],
                    risk_level=p["risk_level"],
                    consent_given_at=consent_at,
                    is_active=True,
                ))

                # User login for patient
                db.add(User(
                    id=uuid.uuid4(),
                    phone=p["phone"],
                    hashed_password=hash_password("patient123456"),
                    role=UserRole.PATIENT,
                    patient_id=pid,
                    is_active=True,
                ))

                patient_ids.append((pid, p["category"], p, "gaza"))
                idx += 1

        # West Bank patients
        for category, count in WB_CATEGORY_COUNTS:
            for _ in range(count):
                p = generate_patient(idx, category, neighborhoods=WEST_BANK_NEIGHBORHOODS, region="West Bank")
                pid = uuid.uuid4()

                consent_at = None
                if random.random() < 0.9:
                    consent_at = datetime.now() - timedelta(days=random.randint(1, 180))

                db.add(Patient(
                    id=pid,
                    phone=p["phone"],
                    name=p["name"],
                    date_of_birth=p["dob"],
                    gender=p["gender"],
                    national_id=p["national_id"],
                    primary_language=random.choice(["ar", "ar", "ar", "ar", "en"]),
                    latitude=p["lat"],
                    longitude=p["lon"],
                    location=_make_point(p["lon"], p["lat"]),
                    location_name=p["location_name"],
                    mobility=p["mobility"],
                    living_situation=p["living"],
                    blood_type=p["blood"],
                    height_cm=p["height_cm"],
                    weight_kg=p["weight_kg"],
                    chronic_conditions=p["conditions"],
                    allergies=p["allergies"],
                    current_medications=p["medications"],
                    special_equipment=p["equipment"],
                    emergency_contacts=p["contacts"],
                    insurance_info=p["insurance"],
                    notes=p["notes"],
                    trust_score=p["trust_score"],
                    risk_score=p["risk_score"],
                    risk_level=p["risk_level"],
                    consent_given_at=consent_at,
                    is_active=True,
                ))

                db.add(User(
                    id=uuid.uuid4(),
                    phone=p["phone"],
                    hashed_password=hash_password("patient123456"),
                    role=UserRole.PATIENT,
                    patient_id=pid,
                    is_active=True,
                ))

                patient_ids.append((pid, p["category"], p, "westbank"))
                idx += 1

        await db.flush()  # Ensure patients exist before SOS FK references

        # ==============================================================
        #  SOS REQUESTS — 50 per department (150 total, covering Gaza + WB)
        # ==============================================================

        facility_map = {
            "hospital": [h1_id, h2_id, h3_id, wh1_id, wh2_id],
            "police": [ps1_id, ps2_id, ps3_id, wps1_id, wps2_id],
            "civil_defense": [cd1_id, cd2_id, cd3_id, wcd1_id, wcd2_id],
        }
        event_type_map = {
            "hospital": [EventType.MEDICAL_EMERGENCY, EventType.MEDICAL_EMERGENCY,
                         EventType.MEDICAL_EMERGENCY, EventType.OTHER],
            "police": [EventType.SHOOTING, EventType.OTHER, EventType.OTHER,
                       EventType.OTHER],
            "civil_defense": [EventType.BUILDING_COLLAPSE, EventType.FIRE,
                              EventType.FLOOD, EventType.CHEMICAL,
                              EventType.BOMBING, EventType.EARTHQUAKE],
        }
        severity_map = {
            "hospital": [AlertSeverity.CRITICAL, AlertSeverity.HIGH,
                         AlertSeverity.HIGH, AlertSeverity.MEDIUM, AlertSeverity.LOW],
            "police": [AlertSeverity.CRITICAL, AlertSeverity.HIGH,
                       AlertSeverity.MEDIUM, AlertSeverity.MEDIUM, AlertSeverity.LOW],
            "civil_defense": [AlertSeverity.CRITICAL, AlertSeverity.CRITICAL,
                              AlertSeverity.HIGH, AlertSeverity.HIGH, AlertSeverity.MEDIUM],
        }
        patient_status_map = {
            "hospital": [PatientStatus.INJURED, PatientStatus.INJURED,
                         PatientStatus.EVACUATE, PatientStatus.SAFE],
            "police": [PatientStatus.INJURED, PatientStatus.TRAPPED,
                       PatientStatus.SAFE, PatientStatus.SAFE],
            "civil_defense": [PatientStatus.TRAPPED, PatientStatus.TRAPPED,
                              PatientStatus.INJURED, PatientStatus.EVACUATE],
        }

        # Pick patients appropriate for each department
        def patients_for_dept(dept, n):
            cat_map = {
                "hospital": ["elderly_medical", "child_medical", "pregnant", "trauma", "general"],
                "police": ["crime_victim", "general"],
                "civil_defense": ["displaced", "trauma", "general"],
            }
            eligible = [(pid, cat, p) for pid, cat, p, _region in patient_ids if cat in cat_map[dept]]
            random.shuffle(eligible)
            return eligible[:n]

        sos_records = []
        now = datetime.now()
        for dept in ["hospital", "police", "civil_defense"]:
            msgs = {"hospital": HOSPITAL_SOS_MSGS, "police": POLICE_SOS_MSGS,
                     "civil_defense": CD_SOS_MSGS}[dept]
            dept_patients = patients_for_dept(dept, 50)
            fac_ids = facility_map[dept]

            for i, (pid, cat, pdata) in enumerate(dept_patients):
                msg = msgs[i % len(msgs)]
                # Simple template substitution
                msg = msg.replace("{condition}", pdata["conditions"][0] if pdata["conditions"] else "condition")
                msg = msg.replace("{high_low}", random.choice(["high", "low"]))
                msg = msg.replace("{bone}", random.choice(["hip", "arm", "leg", "wrist", "rib"]))

                sev = random.randint(2, 5)
                p_status = random.choice(patient_status_map[dept])
                fac_id = random.choice(fac_ids)

                # Time spread: weighted recent — 40% today, 30% 1-3 days, 30% 3-7 days
                bucket = random.random()
                if bucket < 0.40:
                    hours_ago = random.randint(0, 24)
                elif bucket < 0.70:
                    hours_ago = random.randint(24, 72)
                else:
                    hours_ago = random.randint(72, 168)
                created = now - timedelta(hours=hours_ago, minutes=random.randint(0, 59))

                sos_status = random.choices(
                    [SOSStatus.PENDING, SOSStatus.ACKNOWLEDGED, SOSStatus.DISPATCHED, SOSStatus.RESOLVED],
                    weights=[25, 20, 25, 30], k=1
                )[0]
                resolved_at = None
                if sos_status == SOSStatus.RESOLVED:
                    resolved_at = created + timedelta(minutes=random.randint(15, 240))

                sos_id = uuid.uuid4()
                db.add(SosRequest(
                    id=sos_id,
                    patient_id=pid,
                    latitude=pdata["lat"],
                    longitude=pdata["lon"],
                    location=_make_point(pdata["lon"], pdata["lat"]),
                    status=sos_status,
                    patient_status=p_status,
                    severity=sev,
                    source=SOSSource.API,
                    details=msg,
                    routed_department=dept,
                    facility_notified_id=fac_id,
                    hospital_notified_id=fac_id,
                    created_at=created,
                    resolved_at=resolved_at,
                ))

                sos_records.append({
                    "sos_id": sos_id,
                    "pid": pid,
                    "dept": dept,
                    "pdata": pdata,
                    "msg": msg,
                    "sev": sev,
                    "p_status": p_status,
                    "fac_id": fac_id,
                    "created": created,
                })

        await db.flush()  # Ensure SOS exist before alert references

        # ==============================================================
        #  ALERTS — one per SOS (60 total)
        # ==============================================================

        for rec in sos_records:
            evt = random.choice(event_type_map[rec["dept"]])
            a_sev = random.choice(severity_map[rec["dept"]])

            priority = random.randint(30, 95)
            if a_sev == AlertSeverity.CRITICAL:
                priority = random.randint(75, 98)
            elif a_sev == AlertSeverity.HIGH:
                priority = random.randint(55, 80)
            elif a_sev == AlertSeverity.MEDIUM:
                priority = random.randint(35, 60)
            else:
                priority = random.randint(15, 40)

            title_templates = {
                "hospital": [
                    f"Medical Emergency: {rec['pdata']['name']}",
                    f"Critical Patient Alert: {rec['pdata']['conditions'][0] if rec['pdata']['conditions'] else 'emergency'}",
                    f"Urgent Medical: {rec['pdata']['location_name']}",
                ],
                "police": [
                    f"Security Incident: {rec['pdata']['location_name']}",
                    f"Crime Report: {rec['pdata']['name']}",
                    f"Public Safety Alert: {rec['pdata']['location_name']}",
                ],
                "civil_defense": [
                    f"Rescue Required: {rec['pdata']['location_name']}",
                    f"Emergency: {evt.value} at {rec['pdata']['location_name']}",
                    f"Disaster Alert: {rec['pdata']['location_name']}",
                ],
            }

            metadata = {
                "patient_id": str(rec["pid"]),
                "patient_info": {
                    "name": rec["pdata"]["name"],
                    "phone": rec["pdata"]["phone"],
                    "blood_type": rec["pdata"]["blood"],
                },
                "patient_status": rec["p_status"].value,
                "priority_score": priority,
                "conditions": rec["pdata"]["conditions"][:3],
                "mobility": rec["pdata"]["mobility"].value,
                "sos_id": str(rec["sos_id"]),
            }

            db.add(Alert(
                id=uuid.uuid4(),
                event_type=evt,
                severity=a_sev,
                latitude=rec["pdata"]["lat"],
                longitude=rec["pdata"]["lon"],
                location=_make_point(rec["pdata"]["lon"], rec["pdata"]["lat"]),
                radius_m=random.choice([500, 1000, 1500, 2000]),
                title=random.choice(title_templates[rec["dept"]]),
                details=rec["msg"],
                source="sos",
                confidence=round(random.uniform(0.6, 0.95), 2),
                metadata_=metadata,
                affected_patients_count=random.randint(1, 8),
                routed_department=rec["dept"],
                target_facility_id=rec["fac_id"],
                alert_type="primary",
                created_at=rec["created"] + timedelta(seconds=random.randint(5, 60)),
            ))

        # ==============================================================
        #  GEO EVENTS (for Live Map) — use raw SQL to bypass ORM
        #  event_type enum mismatch (model=String, DB=eventtype enum)
        # ==============================================================
        import json as _json

        _geo_sql = text("""
            INSERT INTO geo_events
                (id, event_type, latitude, longitude, location, source,
                 severity, title, details, metadata, layer, created_at, expires_at)
            VALUES
                (:id, :event_type, :lat, :lon,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                 :source, :sev, :title, :details,
                 CAST(:meta AS jsonb), :layer, :created_at, :expires_at)
        """)

        geo_event_count = 0

        # Map SOS dept → DB eventtype enum label (uppercase)
        dept_to_event_type = {
            "hospital": "MEDICAL_EMERGENCY",
            "police": "SHOOTING",
            "civil_defense": "BUILDING_COLLAPSE",
        }

        # 1. SOS layer — create a geo_event for each SOS
        for rec in sos_records:
            lat = rec["pdata"]["lat"]
            lon = rec["pdata"]["lon"]
            await db.execute(_geo_sql, {
                "id": str(uuid.uuid4()), "event_type": dept_to_event_type.get(rec["dept"], "OTHER"),
                "lat": lat, "lon": lon, "source": "SOS", "sev": rec["sev"],
                "title": f"SOS: {rec['pdata']['name']}", "details": rec["msg"][:200],
                "meta": _json.dumps({
                    "patient_id": str(rec["pid"]), "patient_name": rec["pdata"]["name"],
                    "department": rec["dept"], "sos_id": str(rec["sos_id"]),
                }),
                "layer": "sos",
                "created_at": rec["created"],
                "expires_at": rec["created"] + timedelta(hours=random.randint(12, 48)),
            })
            geo_event_count += 1

        # 2. Facility layers — one geo_event per facility, split by department type
        all_facilities = [
            # (fac_id, fac_name, (lat, lon), layer_name)
            (h1_id, "Al-Shifa Medical Complex", (31.5195, 34.4382), "hospital"),
            (h2_id, "European Gaza Hospital", (31.346, 34.306), "hospital"),
            (h3_id, "Al-Aqsa Martyrs Hospital", (31.420, 34.350), "hospital"),
            (ps1_id, "Gaza City Central Police", (31.517, 34.436), "police_station"),
            (ps2_id, "Khan Younis Police", (31.345, 34.304), "police_station"),
            (ps3_id, "Deir al-Balah Police", (31.418, 34.348), "police_station"),
            (cd1_id, "Gaza Civil Defense HQ", (31.519, 34.440), "civil_defense"),
            (cd2_id, "Rafah Civil Defense", (31.295, 34.250), "civil_defense"),
            (cd3_id, "Central Gaza Civil Defense", (31.435, 34.370), "civil_defense"),
            (wh1_id, "Palestine Medical Complex", (31.9038, 35.2034), "hospital"),
            (wh2_id, "Rafidia Hospital", (32.2250, 35.2400), "hospital"),
            (wps1_id, "Ramallah Police HQ", (31.9050, 35.2100), "police_station"),
            (wps2_id, "Hebron Police Station", (31.5260, 35.1070), "police_station"),
            (wcd1_id, "Ramallah Civil Defense", (31.8990, 35.1960), "civil_defense"),
            (wcd2_id, "Nablus Civil Defense", (32.2200, 35.2500), "civil_defense"),
        ]
        for fac_id, fac_name, (lat, lon), fac_layer in all_facilities:
            await db.execute(_geo_sql, {
                "id": str(uuid.uuid4()), "event_type": "INFRASTRUCTURE",
                "lat": lat, "lon": lon, "source": "HOSPITAL", "sev": 1,
                "title": fac_name, "details": f"{fac_name} — operational",
                "meta": _json.dumps({"facility_id": str(fac_id)}),
                "layer": fac_layer,
                "created_at": datetime.utcnow() - timedelta(hours=random.randint(1, 12)),
                "expires_at": datetime.utcnow() + timedelta(hours=72),
            })
            geo_event_count += 1

        # 3. Crisis layer — synthetic crisis events across both regions (25+)
        crisis_events = [
            # Gaza — airstrikes and bombardment
            ("BOMBING", "Airstrike reported", "Multiple explosions heard in residential area", 5, GAZA_NEIGHBORHOODS),
            ("BOMBING", "Airstrike on infrastructure", "Strike on water treatment facility, supply disrupted", 5, GAZA_NEIGHBORHOODS),
            ("BOMBING", "Drone strike confirmed", "Targeted strike near school compound", 5, GAZA_NEIGHBORHOODS),
            ("BOMBING", "Explosion reported", "Unexploded ordnance detonated near market", 5, GAZA_NEIGHBORHOODS),
            # Gaza — fires and structural
            ("FIRE", "Major fire", "Large fire engulfing multi-story building", 4, GAZA_NEIGHBORHOODS),
            ("FIRE", "Fire in camp", "Fire broke out in refugee camp tents", 4, GAZA_NEIGHBORHOODS),
            ("FIRE", "Warehouse fire", "Industrial warehouse ablaze, toxic smoke spreading", 4, GAZA_NEIGHBORHOODS),
            ("BUILDING_COLLAPSE", "Building collapse", "Multi-story residential building collapsed", 5, GAZA_NEIGHBORHOODS),
            ("BUILDING_COLLAPSE", "Structural collapse", "Building collapsed due to structural damage", 4, GAZA_NEIGHBORHOODS),
            # Gaza — other
            ("FLOOD", "Flash flooding", "Streets flooded after heavy rainfall", 3, GAZA_NEIGHBORHOODS),
            ("SHOOTING", "Armed clashes", "Reports of armed confrontation in area", 4, GAZA_NEIGHBORHOODS),
            ("CHEMICAL", "Chemical exposure", "Reports of chemical irritant exposure near border", 3, GAZA_NEIGHBORHOODS),
            ("MEDICAL_EMERGENCY", "Hospital overwhelmed", "Emergency department at full capacity, diverting patients", 4, GAZA_NEIGHBORHOODS),
            ("INFRASTRUCTURE", "Power outage", "Complete blackout affecting entire neighborhood", 3, GAZA_NEIGHBORHOODS),
            # West Bank
            ("BUILDING_COLLAPSE", "House demolition", "Residential structure demolished", 3, WEST_BANK_NEIGHBORHOODS),
            ("BUILDING_COLLAPSE", "Wall collapse", "Retaining wall collapsed near refugee camp", 3, WEST_BANK_NEIGHBORHOODS),
            ("CHEMICAL", "Tear gas incident", "Tear gas fired near residential buildings", 3, WEST_BANK_NEIGHBORHOODS),
            ("CHEMICAL", "Tear gas at school", "Tear gas canisters landed in schoolyard", 4, WEST_BANK_NEIGHBORHOODS),
            ("OTHER", "Settler violence", "Settler attack on agricultural land reported", 3, WEST_BANK_NEIGHBORHOODS),
            ("OTHER", "Settler attack", "Settler group attacked vehicles on main road", 4, WEST_BANK_NEIGHBORHOODS),
            ("SHOOTING", "Military raid", "Large-scale military operation in refugee camp", 4, WEST_BANK_NEIGHBORHOODS),
            ("SHOOTING", "Shooting incident", "Live fire reported near checkpoint area", 5, WEST_BANK_NEIGHBORHOODS),
            ("MEDICAL_EMERGENCY", "Checkpoint incident", "Medical emergency at checkpoint, ambulance delayed", 3, WEST_BANK_NEIGHBORHOODS),
            ("FIRE", "Olive grove fire", "Fire set in olive groves near village", 3, WEST_BANK_NEIGHBORHOODS),
            ("INFRASTRUCTURE", "Road closure", "Main access road blocked, affecting medical transport", 3, WEST_BANK_NEIGHBORHOODS),
        ]
        for evt_type, title, details, sev, neighborhoods in crisis_events:
            hood = random.choice(neighborhoods)
            lat = _jitter(hood[1])
            lon = _jitter(hood[2])
            await db.execute(_geo_sql, {
                "id": str(uuid.uuid4()), "event_type": evt_type,
                "lat": lat, "lon": lon, "source": "SYSTEM", "sev": sev,
                "title": f"{title}: {hood[0]}", "details": details,
                "meta": _json.dumps({"event_subtype": evt_type.lower(), "neighborhood": hood[0]}),
                "layer": "crisis",
                "created_at": datetime.utcnow() - timedelta(hours=random.randint(0, 48)),
                "expires_at": datetime.utcnow() + timedelta(hours=random.randint(12, 72)),
            })
            geo_event_count += 1

        # 4. Telegram intel layer — synthetic intelligence events (20+)
        telegram_events = [
            # Gaza
            ("Military movement reported near border area", 3, GAZA_NEIGHBORHOODS),
            ("Evacuation orders circulating for northern neighborhoods", 4, GAZA_NEIGHBORHOODS),
            ("Reports of water supply contamination in camp", 3, GAZA_NEIGHBORHOODS),
            ("Aid convoy reported heading to southern area", 2, GAZA_NEIGHBORHOODS),
            ("Power grid damage reported, full blackout in district", 3, GAZA_NEIGHBORHOODS),
            ("Hospital requesting urgent blood donations — all types needed", 3, GAZA_NEIGHBORHOODS),
            ("Unexploded ordnance sighted near school compound", 5, GAZA_NEIGHBORHOODS),
            ("Reports of imminent airstrike warning for residential block", 5, GAZA_NEIGHBORHOODS),
            ("Fuel shortage critical — generators running on reserve", 4, GAZA_NEIGHBORHOODS),
            ("Ceasefire violation reported in northern sector", 4, GAZA_NEIGHBORHOODS),
            ("Medical supplies running low at central pharmacy", 3, GAZA_NEIGHBORHOODS),
            ("Displaced families gathering at UNRWA shelter, overcrowding reported", 3, GAZA_NEIGHBORHOODS),
            # West Bank
            ("Settlement expansion activity reported near village", 2, WEST_BANK_NEIGHBORHOODS),
            ("Checkpoint closures affecting medical transport routes", 3, WEST_BANK_NEIGHBORHOODS),
            ("Protest gathering forming near city center", 2, WEST_BANK_NEIGHBORHOODS),
            ("Night raids reported in refugee camp area", 3, WEST_BANK_NEIGHBORHOODS),
            ("Agricultural access restricted in border villages", 2, WEST_BANK_NEIGHBORHOODS),
            ("Military vehicles gathering near main intersection", 3, WEST_BANK_NEIGHBORHOODS),
            ("Reports of arrest campaign targeting young men in camp", 3, WEST_BANK_NEIGHBORHOODS),
            ("Settler road-blocking reported on Route 60", 3, WEST_BANK_NEIGHBORHOODS),
        ]
        for detail, sev, neighborhoods in telegram_events:
            hood = random.choice(neighborhoods)
            lat = _jitter(hood[1])
            lon = _jitter(hood[2])
            await db.execute(_geo_sql, {
                "id": str(uuid.uuid4()), "event_type": "OTHER",
                "lat": lat, "lon": lon, "source": "TELEGRAM", "sev": sev,
                "title": f"Intel: {hood[0]}", "details": detail,
                "meta": _json.dumps({"channel": "crisis_monitor", "neighborhood": hood[0]}),
                "layer": "telegram_intel",
                "created_at": datetime.utcnow() - timedelta(hours=random.randint(1, 24)),
                "expires_at": datetime.utcnow() + timedelta(hours=random.randint(6, 36)),
            })
            geo_event_count += 1

        # 5. SMS activity layer — cluster points (more clusters)
        sms_clusters = [
            # Gaza
            (31.517, 34.438, 22), (31.510, 34.440, 15), (31.346, 34.306, 18),
            (31.295, 34.250, 12), (31.535, 34.498, 16), (31.420, 34.350, 10),
            (31.440, 34.385, 8), (31.543, 34.534, 7),
            # West Bank
            (31.9038, 35.2034, 14), (32.2211, 35.2544, 11), (31.5243, 35.1105, 9),
            (32.4600, 35.3000, 6), (31.7054, 35.2024, 5),
        ]
        for base_lat, base_lon, intensity in sms_clusters:
            lat = _jitter(base_lat, 0.003)
            lon = _jitter(base_lon, 0.003)
            await db.execute(_geo_sql, {
                "id": str(uuid.uuid4()), "event_type": "OTHER",
                "lat": lat, "lon": lon, "source": "SMS",
                "sev": min(5, max(1, intensity // 3)),
                "title": "SMS Activity Cluster",
                "details": f"{intensity} SOS-related SMS messages detected in area",
                "meta": _json.dumps({"message_count": intensity}),
                "layer": "sms_activity",
                "created_at": datetime.utcnow() - timedelta(hours=random.randint(1, 12)),
                "expires_at": datetime.utcnow() + timedelta(hours=24),
            })
            geo_event_count += 1

        # ==============================================================
        #  COMMIT
        # ==============================================================

        await db.commit()

        # ==============================================================
        #  SUMMARY
        # ==============================================================

        print("=" * 70)
        print("  SEED DATA CREATED SUCCESSFULLY")
        print("=" * 70)
        print()
        gaza_count = sum(1 for _, _, _, r in patient_ids if r == "gaza")
        wb_count = sum(1 for _, _, _, r in patient_ids if r == "westbank")
        print(f"  Facilities:  15 (5 hospitals, 5 police, 5 civil defense)")
        print(f"               Gaza: 9  |  West Bank: 6")
        print(f"  Admins:      25 (1 super + 8 hospital + 8 police + 8 civil defense)")
        print(f"  Patients:    {len(patient_ids)} (Gaza: {gaza_count}, West Bank: {wb_count})")
        print(f"  SOS:         {len(sos_records)}")
        print(f"  Alerts:      {len(sos_records)}")
        print(f"  Geo Events:  {geo_event_count} (map markers for live map)")
        print()
        print("  ─── LOGINS ───")
        print()
        print("  Super Admin (all departments):")
        print("    Phone: 0599000000  Password: superadmin123")
        print()
        print("  === GAZA ===")
        print()
        print("  Hospital Admins:")
        print("    Al-Shifa Medical Complex:     0599000001 / admin123456")
        print("    European Gaza Hospital:       0599000002 / admin123456")
        print("    Al-Aqsa Martyrs Hospital:     0599000003 / admin123456")
        print()
        print("  Police Admins:")
        print("    Gaza City Central Police:     0599000010 / admin123456")
        print("    Khan Younis Police:           0599000011 / admin123456")
        print("    Deir al-Balah Police:         0599000012 / admin123456")
        print()
        print("  Civil Defense Admins:")
        print("    Gaza Civil Defense HQ:        0599000020 / admin123456")
        print("    Rafah Civil Defense:          0599000021 / admin123456")
        print("    Central Gaza Civil Defense:   0599000022 / admin123456")
        print()
        print("  === WEST BANK ===")
        print()
        print("  Hospital Admins:")
        print("    Palestine Medical Complex:    0599000030 / admin123456")
        print("    Rafidia Hospital (Nablus):    0599000031 / admin123456")
        print()
        print("  Police Admins:")
        print("    Ramallah Police HQ:           0599000032 / admin123456")
        print("    Hebron Police Station:        0599000033 / admin123456")
        print()
        print("  Civil Defense Admins:")
        print("    Ramallah Civil Defense:       0599000034 / admin123456")
        print("    Nablus Civil Defense:         0599000035 / admin123456")
        print()
        print(f"  Patients: any phone 05991XXXXX with password patient123456")
        print(f"    e.g. 0599100000 to 05991{len(patient_ids)-1:05d}")
        print()
        cat_counts = {}
        for _, cat, _, _ in patient_ids:
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
        print("  Patient breakdown:")
        for cat, cnt in sorted(cat_counts.items(), key=lambda x: -x[1]):
            print(f"    {cat:20s} {cnt}")
        print()
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(seed())
