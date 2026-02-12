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


def _get_master_key() -> bytes:
    key = settings.ENCRYPTION_MASTER_KEY.encode()
    return hashlib.sha256(key).digest()


# --- AES-256 for medical records at rest ---

def encrypt_medical_data(plaintext: bytes) -> bytes:
    key = _get_master_key()
    iv = os.urandom(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    padder = PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return iv + ciphertext  # Prepend IV


def decrypt_medical_data(encrypted: bytes) -> bytes:
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
