"""
Application-layer encryption helpers.

Medical records at rest (feature 11.1.2) use AES-256-GCM — authenticated
encryption, so ciphertext tampering is detected on decrypt. Data written by
the legacy AES-CBC format (no authentication) is still readable:
``decrypt_medical_data`` transparently falls back for old payloads.

SMS SOS payloads (feature 11.1.4) use AES-128-GCM with a per-patient key
derived from the master key via HKDF.

The master key comes from ``ENCRYPTION_MASTER_KEY``; ``app.config`` refuses
to boot in production (DEBUG=False) with a placeholder key.
"""

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.padding import PKCS7

from app.config import get_settings

settings = get_settings()

# Version tag prepended to AES-GCM medical payloads. Legacy AES-CBC blobs
# start with a random IV, so a fixed magic prefix safely disambiguates.
_MEDICAL_GCM_MAGIC = b"TMTE2:"
_MEDICAL_AAD = b"tmt-medical-record-v2"


def _get_master_key() -> bytes:
    key = settings.ENCRYPTION_MASTER_KEY.encode()
    return hashlib.sha256(key).digest()


# --- AES-256 for medical records at rest ---

def encrypt_medical_data(plaintext: bytes) -> bytes:
    """Encrypt sensitive medical data with AES-256-GCM (authenticated)."""
    key = _get_master_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, _MEDICAL_AAD)
    return _MEDICAL_GCM_MAGIC + nonce + ciphertext


def decrypt_medical_data(encrypted: bytes) -> bytes:
    """Decrypt medical data; supports current GCM and legacy CBC formats."""
    if encrypted.startswith(_MEDICAL_GCM_MAGIC):
        key = _get_master_key()
        raw = encrypted[len(_MEDICAL_GCM_MAGIC):]
        nonce, ciphertext = raw[:12], raw[12:]
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, _MEDICAL_AAD)
    return _decrypt_medical_data_legacy_cbc(encrypted)


def _decrypt_medical_data_legacy_cbc(encrypted: bytes) -> bytes:
    """Legacy AES-256-CBC format (IV-prefixed, unauthenticated).

    Kept read-only for data written before the GCM migration. New writes
    always use :func:`encrypt_medical_data`.
    """
    key = _get_master_key()
    iv = encrypted[:16]
    ciphertext = encrypted[16:]
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = PKCS7(128).unpadder()
    return unpadder.update(padded) + unpadder.finalize()


# --- AES-128-GCM for SMS SOS payloads ---

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
