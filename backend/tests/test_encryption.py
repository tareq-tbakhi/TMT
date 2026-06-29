"""
Unit tests for the at-rest / in-transit encryption helpers.

These cover the AES-256-GCM medical-data path added to stop storing PHI in
plaintext, plus the existing SMS payload path. They only require the
`cryptography` package (no DB / no heavy AI deps).

Run:  cd backend && python -m pytest tests/test_encryption.py -q
"""

import os

import pytest

# Ensure a deterministic master key for the test process.
os.environ.setdefault("ENCRYPTION_MASTER_KEY", "unit-test-master-key")

from cryptography.exceptions import InvalidTag

from app.api.middleware.encryption import (
    encrypt_medical_data,
    decrypt_medical_data,
    encrypt_phi,
    decrypt_phi,
    encrypt_sms_payload,
    decrypt_sms_payload,
    _MEDICAL_V2,
)


# --- AES-256-GCM medical bytes ---------------------------------------------

def test_medical_roundtrip():
    plaintext = b"sensitive medical bytes \xf0\x9f\x9a\x91"
    blob = encrypt_medical_data(plaintext)
    assert decrypt_medical_data(blob) == plaintext


def test_ciphertext_is_versioned_and_not_plaintext():
    plaintext = b"diabetes,insulin"
    blob = encrypt_medical_data(plaintext)
    assert blob[:1] == _MEDICAL_V2          # version tag present
    assert plaintext not in blob            # not stored in the clear


def test_nonce_is_random_per_encryption():
    # Same input must produce different ciphertexts (semantic security).
    a = encrypt_medical_data(b"same input")
    b = encrypt_medical_data(b"same input")
    assert a != b


def test_tampering_is_detected():
    blob = bytearray(encrypt_medical_data(b"do not tamper"))
    blob[-1] ^= 0x01  # flip a bit in the GCM tag/ciphertext
    with pytest.raises(InvalidTag):
        decrypt_medical_data(bytes(blob))


def test_unknown_version_rejected():
    with pytest.raises(ValueError):
        decrypt_medical_data(b"\x99" + os.urandom(12) + b"xxxx")


def test_empty_rejected():
    with pytest.raises(ValueError):
        decrypt_medical_data(b"")


# --- PHI dict helpers -------------------------------------------------------

def test_phi_dict_roundtrip():
    phi = {
        "conditions": ["diabetes", "asthma"],
        "medications": ["insulin"],
        "allergies": ["penicillin"],
        "special_equipment": ["oxygen"],
        "notes": "needs wheelchair access — السكري",
    }
    blob = encrypt_phi(phi)
    out = decrypt_phi(blob)
    assert out == phi


def test_phi_unicode_preserved():
    phi = {"notes": "مريض بحاجة إلى أكسجين", "conditions": []}
    assert decrypt_phi(encrypt_phi(phi))["notes"] == "مريض بحاجة إلى أكسجين"


# --- SMS payload path (unchanged behavior) ---------------------------------

def test_sms_roundtrip_per_patient_key():
    pid = "patient-123"
    wire = encrypt_sms_payload("HELP injured GPS:31.5,34.4", pid)
    assert wire.startswith("TMT:v1:")
    assert decrypt_sms_payload(wire, pid) == "HELP injured GPS:31.5,34.4"


def test_sms_wrong_patient_key_fails():
    wire = encrypt_sms_payload("secret", "patient-A")
    with pytest.raises(Exception):
        decrypt_sms_payload(wire, "patient-B")
