"""
Encryption helpers for data at rest and in transit.

Two independent schemes live here:

1. Medical / PHI records at rest — authenticated **AES-256-GCM**. The data key
   is derived from the configured master key via HKDF-SHA256 (no raw passphrase
   reuse). Each ciphertext is self-describing: a 1-byte version tag, a random
   12-byte nonce, then the GCM ciphertext+tag. GCM gives confidentiality AND
   integrity, so tampering is detected on decrypt.

2. SMS SOS payloads in transit — per-patient AES-128-GCM keys derived via HKDF.
   Kept compatible with the existing wire format ("TMT:v1:...").
"""

import base64
import hashlib
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from app.config import get_settings

settings = get_settings()


def _get_master_key() -> bytes:
    """32-byte root key material derived from the configured master secret."""
    return hashlib.sha256(settings.ENCRYPTION_MASTER_KEY.encode()).digest()


# ---------------------------------------------------------------------------
# Medical / PHI records at rest — AES-256-GCM (authenticated)
# ---------------------------------------------------------------------------

# Version tag for the at-rest medical ciphertext format. Bumping this lets us
# rotate algorithms/keys without ambiguity. v2 = AES-256-GCM.
_MEDICAL_V2 = b"\x02"
_NONCE_LEN = 12

# PHI fields that must never be persisted in plaintext.
PHI_FIELDS = ("conditions", "medications", "allergies", "special_equipment", "notes")


def _derive_medical_key() -> bytes:
    """Derive a dedicated 32-byte AES-256 key for medical data via HKDF."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,  # AES-256
        salt=None,
        info=b"tmt-medical-record-v2",
    )
    return hkdf.derive(_get_master_key())


def encrypt_medical_data(plaintext: bytes) -> bytes:
    """Encrypt bytes with AES-256-GCM. Returns version || nonce || ciphertext+tag."""
    key = _derive_medical_key()
    nonce = os.urandom(_NONCE_LEN)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
    return _MEDICAL_V2 + nonce + ciphertext


def decrypt_medical_data(encrypted: bytes) -> bytes:
    """Decrypt bytes produced by encrypt_medical_data. Raises on tampering."""
    if not encrypted:
        raise ValueError("Cannot decrypt empty payload")
    version = encrypted[:1]
    if version != _MEDICAL_V2:
        raise ValueError(f"Unsupported medical ciphertext version: {version!r}")
    nonce = encrypted[1 : 1 + _NONCE_LEN]
    ciphertext = encrypted[1 + _NONCE_LEN :]
    key = _derive_medical_key()
    # AESGCM.decrypt raises cryptography.exceptions.InvalidTag on any tampering
    return AESGCM(key).decrypt(nonce, ciphertext, None)


def encrypt_phi(data: dict[str, Any]) -> bytes:
    """Serialize a PHI dict to JSON and encrypt it for at-rest storage."""
    payload = json.dumps(data, default=str, ensure_ascii=False).encode("utf-8")
    return encrypt_medical_data(payload)


def decrypt_phi(blob: bytes) -> dict[str, Any]:
    """Decrypt and deserialize a PHI blob produced by encrypt_phi."""
    return json.loads(decrypt_medical_data(blob).decode("utf-8"))


# ---------------------------------------------------------------------------
# SMS SOS payloads in transit — AES-128-GCM, per-patient key
# ---------------------------------------------------------------------------

def derive_patient_sms_key(patient_id: str) -> bytes:
    master = _get_master_key()
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=16,  # AES-128
        salt=None,
        info=patient_id.encode(),
    )
    return hkdf.derive(master)


def encrypt_sms_payload(payload: str, patient_id: str) -> str:
    key = derive_patient_sms_key(patient_id)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, payload.encode(), None)
    encoded = base64.b64encode(nonce + ciphertext).decode()
    return f"TMT:v1:{encoded}"


def decrypt_sms_payload(sms_body: str, patient_id: str) -> str:
    if not sms_body.startswith("TMT:v1:"):
        raise ValueError("Invalid SMS format")
    encoded = sms_body[7:]  # Strip "TMT:v1:"
    raw = base64.b64decode(encoded)
    nonce = raw[:12]
    ciphertext = raw[12:]
    key = derive_patient_sms_key(patient_id)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode()
