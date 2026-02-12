/**
 * AES-128-GCM encryption using the Web Crypto API.
 * Used for encrypting SMS SOS payloads in offline mode.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 128; // bits
const IV_LENGTH = 12; // bytes - standard for AES-GCM

/**
 * Derives an AES-128 key from a passphrase using PBKDF2.
 */
export async function deriveKey(passphrase: string): Promise<CryptoKey> {
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
      salt: encoder.encode("TMT-SMS-SALT-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Imports a raw AES-128 key from a base64-encoded string.
 */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const rawKey = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-128-GCM.
 * Returns a base64-encoded string containing IV + ciphertext + tag.
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );

  // Combine IV + ciphertext (which includes the auth tag in Web Crypto)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts an AES-128-GCM encrypted base64 string.
 */
export async function decrypt(
  encryptedBase64: string,
  key: CryptoKey
): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0)
  );

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
