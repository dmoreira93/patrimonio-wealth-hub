/**
 * AES-GCM 256-bit + PBKDF2 (120,000 iterations, SHA-256) Cryptographic Vault
 * for Encrypted JSON Backups, Local File Sync & GitHub Cloud Backup.
 */

const PBKDF2_ITERATIONS = 120_000;

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface EncryptedVaultPayload {
  app: "patrimonio-wealth-hub";
  version: 1;
  exportedAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

async function deriveAesKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = new Uint8Array(b64ToBuf(saltB64));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWealthState(
  stateObj: unknown,
  password: string,
): Promise<EncryptedVaultPayload> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const saltB64 = bufToB64(saltBytes.buffer);
  const key = await deriveAesKey(password, saltB64);

  const plaintext = new TextEncoder().encode(JSON.stringify(stateObj));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    plaintext,
  );

  return {
    app: "patrimonio-wealth-hub",
    version: 1,
    exportedAt: new Date().toISOString(),
    salt: saltB64,
    iv: bufToB64(ivBytes.buffer),
    ciphertext: bufToB64(ciphertextBuf),
  };
}

export async function decryptWealthState<T>(
  payload: EncryptedVaultPayload,
  password: string,
): Promise<T> {
  const key = await deriveAesKey(password, payload.salt);
  const iv = new Uint8Array(b64ToBuf(payload.iv));
  const ciphertextBuf = b64ToBuf(payload.ciphertext);

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertextBuf,
  );
  const jsonText = new TextDecoder().decode(plainBuf);
  return JSON.parse(jsonText) as T;
}

export function downloadJsonFile(filename: string, contentObj: unknown) {
  const blob = new Blob([JSON.stringify(contentObj, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
