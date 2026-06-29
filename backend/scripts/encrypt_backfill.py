"""
One-time backfill: encrypt PHI on rows that predate at-rest encryption.

Any `patients` / `medical_records` row that still has NULL `encrypted_data`
(e.g. seeded or migrated before encryption was enabled) is re-written through
the service-layer encrypt helpers, which move PHI into `encrypted_data` and
clear the plaintext columns.

Idempotent: rows that already have `encrypted_data` are skipped. Safe to run
multiple times.

Usage:
    cd backend && python -m scripts.encrypt_backfill          # apply
    cd backend && python -m scripts.encrypt_backfill --dry-run # report only
"""

import asyncio
import sys

from sqlalchemy import select

from app.db.postgres import async_session
from app.models.patient import Patient
from app.models.medical_record import MedicalRecord
from app.services.patient_service import (
    _read_patient_phi,
    _write_patient_phi,
    _PATIENT_PHI_FIELDS,
    _read_phi,
    _write_phi,
)


async def backfill(dry_run: bool = False) -> None:
    patients_done = 0
    records_done = 0

    async with async_session() as db:
        # --- Patients ---
        result = await db.execute(select(Patient).where(Patient.encrypted_data.is_(None)))
        for patient in result.scalars().all():
            phi = _read_patient_phi(patient)  # reads legacy plaintext columns
            if not dry_run:
                _write_patient_phi(patient, {k: phi.get(k) for k in _PATIENT_PHI_FIELDS})
            patients_done += 1

        # --- Medical records ---
        result = await db.execute(
            select(MedicalRecord).where(MedicalRecord.encrypted_data.is_(None))
        )
        for record in result.scalars().all():
            phi = _read_phi(record)
            if not dry_run:
                _write_phi(record, phi)
            records_done += 1

        if dry_run:
            print(f"[dry-run] would encrypt {patients_done} patients, {records_done} medical records")
        else:
            await db.commit()
            print(f"Encrypted {patients_done} patients, {records_done} medical records")


if __name__ == "__main__":
    asyncio.run(backfill(dry_run="--dry-run" in sys.argv))
