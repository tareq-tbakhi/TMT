"""
Seed script — creates hospitals, admin users, and a sample patient.
Run inside the backend container:
    docker exec tmt-backend python seed.py
"""
import asyncio
import uuid
from datetime import datetime

from sqlalchemy import func as sa_func

from app.db.postgres import engine, Base, async_session
from app.models.user import User, UserRole
from app.models.hospital import Hospital, HospitalStatus
from app.models.patient import Patient, MobilityStatus, LivingSituation
from app.api.middleware.auth import hash_password


def _make_point(longitude: float, latitude: float):
    """PostGIS point expression for seed data."""
    return sa_func.ST_SetSRID(sa_func.ST_MakePoint(longitude, latitude), 4326)


async def seed():
    # Create tables if not exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # --- Hospital 1: Al-Shifa ---
        h1_id = uuid.uuid4()
        h1 = Hospital(
            id=h1_id,
            name="Al-Shifa Medical Complex",
            latitude=31.5195,
            longitude=34.4382,
            location=_make_point(34.4382, 31.5195),
            status=HospitalStatus.OPERATIONAL,
            bed_capacity=500,
            icu_beds=40,
            available_beds=120,
            specialties=["trauma", "surgery", "pediatrics", "emergency"],
            coverage_radius_km=20.0,
            phone="+970-8-2861111",
            supply_levels={"blood": 60, "medications": 45, "oxygen": 70, "surgical": 50},
        )
        db.add(h1)

        # --- Hospital 2: European Gaza Hospital ---
        h2_id = uuid.uuid4()
        h2 = Hospital(
            id=h2_id,
            name="European Gaza Hospital",
            latitude=31.3225,
            longitude=34.3100,
            location=_make_point(34.3100, 31.3225),
            status=HospitalStatus.LIMITED,
            bed_capacity=250,
            icu_beds=20,
            available_beds=30,
            specialties=["trauma", "orthopedics", "internal_medicine"],
            coverage_radius_km=15.0,
            phone="+970-8-2641111",
            supply_levels={"blood": 30, "medications": 25, "oxygen": 40, "surgical": 20},
        )
        db.add(h2)

        # --- Super Admin User (system-wide) ---
        super_admin = User(
            id=uuid.uuid4(),
            phone="0599000000",
            email="superadmin@tmt.ps",
            hashed_password=hash_password("superadmin123"),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        db.add(super_admin)

        # --- Hospital Admin User (for Al-Shifa) ---
        admin = User(
            id=uuid.uuid4(),
            phone="0599000001",
            email="admin@alshifa.ps",
            hashed_password=hash_password("admin123456"),
            role=UserRole.HOSPITAL_ADMIN,
            hospital_id=h1_id,
            is_active=True,
        )
        db.add(admin)

        # --- Hospital Admin User (for European Gaza) ---
        admin2 = User(
            id=uuid.uuid4(),
            phone="0599000002",
            email="admin@egh.ps",
            hashed_password=hash_password("admin123456"),
            role=UserRole.HOSPITAL_ADMIN,
            hospital_id=h2_id,
            is_active=True,
        )
        db.add(admin2)

        # --- Sample Patient ---
        p1_id = uuid.uuid4()
        p1 = Patient(
            id=p1_id,
            phone="0599100001",
            name="Ahmad Khalil",
            latitude=31.5100,
            longitude=34.4400,
            location=_make_point(34.4400, 31.5100),
            mobility=MobilityStatus.CAN_WALK,
            living_situation=LivingSituation.WITH_FAMILY,
            blood_type="O+",
            emergency_contacts=[{"name": "Sara Khalil", "phone": "0599100002", "relation": "wife"}],
            is_active=True,
        )
        db.add(p1)

        p1_user = User(
            id=uuid.uuid4(),
            phone="0599100001",
            hashed_password=hash_password("patient123456"),
            role=UserRole.PATIENT,
            patient_id=p1_id,
            is_active=True,
        )
        db.add(p1_user)

        await db.commit()
        print("=" * 60)
        print("  SEED DATA CREATED SUCCESSFULLY")
        print("=" * 60)
        print()
        print("  Super Admin (system-wide):")
        print("    Phone:    0599000000")
        print("    Password: superadmin123")
        print()
        print("  Hospital Admin (Al-Shifa):")
        print("    Phone:    0599000001")
        print("    Password: admin123456")
        print()
        print("  Hospital Admin (European Gaza):")
        print("    Phone:    0599000002")
        print("    Password: admin123456")
        print()
        print("  Patient (Ahmad Khalil):")
        print("    Phone:    0599100001")
        print("    Password: patient123456")
        print()
        print("  Or register a new patient at http://localhost:3000/register")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
