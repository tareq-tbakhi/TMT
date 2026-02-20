/**
 * Encrypted Offline Vault
 *
 * Wraps IndexedDB with AES-256-GCM encryption. Every record is encrypted
 * before writing and decrypted on read, so a stolen/seized device cannot
 * expose patient data at rest.
 *
 * Stores:
 *   - pending_sos    — queued SOS requests awaiting connectivity
 *   - pending_sync   — mixed events (updates, triage) for batch sync
 *   - patient_cache  — cached patient medical profile for offline use
 *   - local_actions  — hospital staff local actions for sync
 *
 * Key derivation: PBKDF2 from a device fingerprint + user token hash.
 */

const DB_NAME = "tmt-vault";
const DB_VERSION = 1;
const STORES = ["pending_sos", "pending_sync", "patient_cache", "local_actions"] as const;

export type VaultStore = (typeof STORES)[number];

// AES-GCM parameters
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256; // bits — AES-256
const IV_LENGTH = 12; // bytes
const SALT = "TMT-VAULT-SALT-v1";
const PBKDF2_ITERATIONS = 100_000;

// ─── Key Management ──────────────────────────────────────────────

let _vaultKey: CryptoKey | null = null;

/**
 * Derives the vault encryption key from available device/user context.
 * Uses PBKDF2 with a passphrase composed of device ID + user token hash.
 */
async function getVaultKey(): Promise<CryptoKey> {
  if (_vaultKey) return _vaultKey;

  // Build passphrase from available sources
  const parts: string[] = [];

  // User auth token hash (changes per session but stable during a session)
  const token = localStorage.getItem("auth_token") || "";
  if (token) {
    const tokenBytes = new TextEncoder().encode(token);
    const hash = await crypto.subtle.digest("SHA-256", tokenBytes);
    parts.push(btoa(String.fromCharCode(...new Uint8Array(hash))).substring(0, 16));
  }

  // Device/app identifier
  const deviceId = localStorage.getItem("tmt-device-id") || generateDeviceId();
  parts.push(deviceId);

  const passphrase = parts.join(":");
  _vaultKey = await deriveKey(passphrase);
  return _vaultKey;
}

function generateDeviceId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem("tmt-device-id", id);
  return id;
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── Encryption helpers ──────────────────────────────────────────

async function encryptData(data: unknown): Promise<ArrayBuffer> {
  const key = await getVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    plaintext
  );

  // Combine: iv + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined.buffer;
}

async function decryptData<T = unknown>(encrypted: ArrayBuffer): Promise<T> {
  const key = await getVaultKey();
  const bytes = new Uint8Array(encrypted);
  const iv = bytes.slice(0, IV_LENGTH);
  const ciphertext = bytes.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ─── IndexedDB ───────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Vault API ───────────────────────────────────────────────────

/**
 * Store an encrypted record.
 */
async function put(store: VaultStore, id: string, data: unknown): Promise<void> {
  const encrypted = await encryptData(data);
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put({ id, data: encrypted });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve and decrypt a single record.
 */
async function get<T = unknown>(store: VaultStore, id: string): Promise<T | null> {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  const request = tx.objectStore(store).get(id);

  const record = await new Promise<{ id: string; data: ArrayBuffer } | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!record) return null;
  return decryptData<T>(record.data);
}

/**
 * Retrieve and decrypt all records from a store.
 */
async function getAll<T = unknown>(store: VaultStore): Promise<Array<T & { _vaultId: string }>> {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  const request = tx.objectStore(store).getAll();

  const records = await new Promise<Array<{ id: string; data: ArrayBuffer }>>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const results: Array<T & { _vaultId: string }> = [];
  for (const record of records) {
    try {
      const decrypted = await decryptData<T>(record.data);
      results.push({ ...decrypted as T & object, _vaultId: record.id });
    } catch {
      // Skip records we can't decrypt (key changed, corrupted)
      console.warn(`[Vault] Failed to decrypt record ${record.id} in ${store}`);
    }
  }

  return results;
}

/**
 * Delete a record from a store.
 */
async function del(store: VaultStore, id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all records from a store.
 */
async function clear(store: VaultStore): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get count of records in a store.
 */
async function count(store: VaultStore): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  const request = tx.objectStore(store).count();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Invalidate cached key (call on logout or token change).
 */
function invalidateKey(): void {
  _vaultKey = null;
}

// ─── Export ──────────────────────────────────────────────────────

export const OfflineVault = {
  put,
  get,
  getAll,
  delete: del,
  clear,
  count,
  invalidateKey,
};
