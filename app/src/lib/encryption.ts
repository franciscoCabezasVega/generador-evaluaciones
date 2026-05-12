/**
 * AES-GCM encryption/decryption using Web Crypto API (Node.js built-in).
 * Key is sourced from CLICKUP_ENCRYPTION_KEY env var (32-byte hex string).
 * No external dependencies required.
 */

const KEY_ENV = "CLICKUP_ENCRYPTION_KEY";
const ALGORITHM = "AES-GCM";
const IV_BYTE_LENGTH = 12; // 96-bit IV recommended for AES-GCM

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(): Promise<CryptoKey> {
  const keyHex = process.env[KEY_ENV];
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      `${KEY_ENV} must be a 64-character hex string (32 bytes). ` +
        `Generate with: openssl rand -hex 32`,
    );
  }
  const rawKey = hexToBytes(keyHex);
  return crypto.subtle.importKey("raw", rawKey, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptText(
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );
  return {
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
  };
}

export async function decryptText(
  ciphertext: string,
  iv: string,
): Promise<string> {
  const key = await deriveKey();
  const encryptedBytes = hexToBytes(ciphertext);
  const ivBytes = hexToBytes(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBytes },
    key,
    encryptedBytes,
  );
  return new TextDecoder().decode(decrypted);
}
