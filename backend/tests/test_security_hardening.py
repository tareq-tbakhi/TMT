"""
Security hardening tests.

Covers:
- Rate limiting store (feature 11.2.6): sliding window, Retry-After, auth buckets
- Token revocation (feature 11.2.5): jti revocation, revoke-all-for-user, legacy tokens
- JWT claims: jti / iat / exp present and decodable
- Timing-safe password verification (user enumeration defence)
- Medical-data encryption: AES-GCM roundtrip, tamper detection, legacy CBC fallback
- PII masking helpers used in audit details

No live database or Redis required — everything runs against the in-memory
implementations.
"""

import asyncio
import time

import pytest
from fastapi import HTTPException

from app.api.middleware.rate_limit import (
    InMemoryRateLimitStore,
    _bucket_for_path,
)
from app.api.middleware.auth import (
    InMemoryTokenRevocationStore,
    TokenData,
    check_token_revocation,
    create_access_token,
    decode_token,
    set_revocation_store,
    verify_password_safe,
    hash_password,
)
from app.api.middleware.audit import mask_email, mask_phone
from app.api.middleware.encryption import (
    _MEDICAL_GCM_MAGIC,
    decrypt_medical_data,
    encrypt_medical_data,
)
from app.config import get_settings

settings = get_settings()


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

class TestInMemoryRateLimitStore:
    def test_counts_hits_within_window(self):
        store = InMemoryRateLimitStore()

        async def run():
            counts = []
            for _ in range(5):
                count, _retry = await store.hit("k", 60)
                counts.append(count)
            return counts

        assert asyncio.run(run()) == [1, 2, 3, 4, 5]

    def test_window_expiry_resets_count(self, monkeypatch):
        store = InMemoryRateLimitStore()
        now = [1000.0]
        monkeypatch.setattr(time, "time", lambda: now[0])

        async def run():
            await store.hit("k", 10)
            await store.hit("k", 10)
            now[0] += 11  # advance past the window
            count, _ = await store.hit("k", 10)
            return count

        assert asyncio.run(run()) == 1

    def test_retry_after_is_positive_when_limited(self):
        store = InMemoryRateLimitStore()

        async def run():
            retry = 0.0
            for _ in range(3):
                _, retry = await store.hit("k", 60)
            return retry

        retry_after = asyncio.run(run())
        assert 0.0 < retry_after <= 60.0

    def test_keys_are_isolated(self):
        store = InMemoryRateLimitStore()

        async def run():
            await store.hit("a", 60)
            await store.hit("a", 60)
            count_b, _ = await store.hit("b", 60)
            return count_b

        assert asyncio.run(run()) == 1

    def test_capacity_eviction_keeps_store_bounded(self):
        store = InMemoryRateLimitStore(max_keys=100)

        async def run():
            for i in range(250):
                await store.hit(f"key-{i}", 60)
            return len(store._buckets)

        assert asyncio.run(run()) <= 110  # bounded despite key spraying


class TestAuthBuckets:
    def test_login_paths_get_strict_bucket(self):
        prefix = settings.API_PREFIX
        for suffix in ("/auth/login", "/patients/login", "/hospitals/login"):
            bucket = _bucket_for_path("POST", f"{prefix}{suffix}")
            assert bucket is not None
            name, limit = bucket
            assert name in ("auth", "register")
            assert limit == settings.RATE_LIMIT_AUTH_MAX

    def test_otp_paths_get_strictest_bucket(self):
        prefix = settings.API_PREFIX
        bucket = _bucket_for_path("POST", f"{prefix}/telegram/auth/send-code")
        assert bucket == ("otp", settings.RATE_LIMIT_OTP_MAX)

    def test_registration_bucket_is_post_only(self):
        prefix = settings.API_PREFIX
        assert _bucket_for_path("POST", f"{prefix}/patients") is not None
        assert _bucket_for_path("GET", f"{prefix}/patients") is None

    def test_normal_paths_are_unbucketed(self):
        prefix = settings.API_PREFIX
        assert _bucket_for_path("GET", f"{prefix}/hospitals") is None
        assert _bucket_for_path("POST", f"{prefix}/sos") is None


# ---------------------------------------------------------------------------
# Token revocation / session invalidation
# ---------------------------------------------------------------------------

class TestTokenRevocation:
    def test_revoked_jti_is_detected(self):
        store = InMemoryTokenRevocationStore()

        async def run():
            await store.revoke_jti("abc123")
            return await store.is_jti_revoked("abc123"), await store.is_jti_revoked("other")

        revoked, other = asyncio.run(run())
        assert revoked is True
        assert other is False

    def test_expired_revocations_are_pruned(self):
        store = InMemoryTokenRevocationStore()

        async def run():
            await store.revoke_jti("old", expires_at=int(time.time()) - 10)
            return await store.is_jti_revoked("old")

        assert asyncio.run(run()) is False

    def test_revoke_all_sets_cutoff(self):
        store = InMemoryTokenRevocationStore()

        async def run():
            before = await store.user_revocation_cutoff("u1")
            await store.revoke_all_for_user("u1")
            after = await store.user_revocation_cutoff("u1")
            return before, after

        before, after = asyncio.run(run())
        assert before is None
        assert after is not None and after <= time.time()

    def test_check_token_revocation_rejects_revoked_jti(self):
        store = InMemoryTokenRevocationStore()
        set_revocation_store(store)
        token_data = TokenData(
            user_id="00000000-0000-0000-0000-000000000001",
            role="patient",
            jti="revoked-jti",
            iat=int(time.time()),
        )

        async def run():
            await store.revoke_jti("revoked-jti")
            await check_token_revocation(token_data)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(run())
        assert exc.value.status_code == 401
        set_revocation_store(InMemoryTokenRevocationStore())

    def test_check_token_revocation_kills_legacy_tokens_on_revoke_all(self):
        """Tokens without iat/jti must die when the user is force-logged-out."""
        store = InMemoryTokenRevocationStore()
        set_revocation_store(store)
        legacy = TokenData(
            user_id="00000000-0000-0000-0000-000000000002",
            role="patient",
        )

        async def run():
            await store.revoke_all_for_user(legacy.user_id)
            await check_token_revocation(legacy)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(run())
        assert exc.value.status_code == 401
        set_revocation_store(InMemoryTokenRevocationStore())

    def test_fresh_token_passes_revocation_check(self):
        set_revocation_store(InMemoryTokenRevocationStore())
        token_data = TokenData(
            user_id="00000000-0000-0000-0000-000000000003",
            role="patient",
            jti="fresh",
            iat=int(time.time()),
        )
        asyncio.run(check_token_revocation(token_data))  # must not raise


# ---------------------------------------------------------------------------
# JWT claims
# ---------------------------------------------------------------------------

class TestJwtClaims:
    def test_token_carries_jti_iat_exp(self):
        token = create_access_token({
            "sub": "00000000-0000-0000-0000-000000000009",
            "role": "patient",
        })
        data = decode_token(token)
        assert data.jti and len(data.jti) == 32
        assert data.iat is not None
        assert data.exp is not None and data.exp > data.iat

    def test_each_token_has_unique_jti(self):
        payload = {"sub": "00000000-0000-0000-0000-000000000009", "role": "patient"}
        t1 = decode_token(create_access_token(payload))
        t2 = decode_token(create_access_token(payload))
        assert t1.jti != t2.jti

    def test_garbage_token_rejected(self):
        with pytest.raises(HTTPException) as exc:
            decode_token("not-a-token")
        assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

class TestPasswordVerification:
    def test_verify_password_safe_with_missing_account(self):
        assert verify_password_safe("whatever", None) is False

    def test_verify_password_safe_roundtrip(self):
        hashed = hash_password("s3cure-pass!")
        assert verify_password_safe("s3cure-pass!", hashed) is True
        assert verify_password_safe("wrong", hashed) is False


# ---------------------------------------------------------------------------
# Encryption at rest
# ---------------------------------------------------------------------------

class TestMedicalEncryption:
    def test_gcm_roundtrip(self):
        plaintext = b'{"conditions": ["diabetes"], "notes": "sensitive"}'
        blob = encrypt_medical_data(plaintext)
        assert blob.startswith(_MEDICAL_GCM_MAGIC)
        assert decrypt_medical_data(blob) == plaintext

    def test_tampering_is_detected(self):
        blob = bytearray(encrypt_medical_data(b"medical data"))
        blob[-1] ^= 0x01  # flip one ciphertext bit
        with pytest.raises(Exception):
            decrypt_medical_data(bytes(blob))

    def test_legacy_cbc_blobs_still_decrypt(self):
        import hashlib
        import os
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives.padding import PKCS7

        key = hashlib.sha256(settings.ENCRYPTION_MASTER_KEY.encode()).digest()
        iv = os.urandom(16)
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        encryptor = cipher.encryptor()
        padder = PKCS7(128).padder()
        padded = padder.update(b"legacy record") + padder.finalize()
        legacy_blob = iv + encryptor.update(padded) + encryptor.finalize()

        assert decrypt_medical_data(legacy_blob) == b"legacy record"


# ---------------------------------------------------------------------------
# PII masking
# ---------------------------------------------------------------------------

class TestPiiMasking:
    def test_mask_phone(self):
        masked = mask_phone("+970597488379")
        assert masked == "+9705***379"
        assert "97488" not in masked

    def test_mask_phone_short_and_empty(self):
        assert mask_phone("") == "<none>"
        assert mask_phone("123") == "***"

    def test_mask_email(self):
        assert mask_email("wael@example.com") == "w***@example.com"
        assert mask_email(None) == "<none>"
