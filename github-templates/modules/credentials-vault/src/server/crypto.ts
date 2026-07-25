// AES-256-GCM at rest for credential secrets.
//
// Inline implementation so the plugin tsc-cleans + smokes standalone.
// Format string: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`. Versioned
// so we can rotate the algorithm later without a migration.
//
// Key resolution (priority):
//   1. constructor-injected `key` Buffer (tests, FoundationCryptoPort).
//   2. `process.env.AQUA_VAULT_KEY` — base64-encoded 32-byte key.
//   3. throws — refuses to silently downgrade to a plaintext store.
//
// Foundation lift candidate: when a portal-side `cryptoPort` ships
// with KMS-backed key rotation, the plugin should accept it via the
// foundation registration adapter and drop the env-var path.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_LEN = 12;
const KEY_LEN = 32;
const TAG_LEN = 16;

export interface CryptoKey {
  readonly key: Buffer;
}

export function loadKeyFromEnv(envName = "AQUA_VAULT_KEY"): CryptoKey | null {
  const raw = process.env[envName];
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(`@aqua/plugin-credentials-vault: ${envName} must be base64 32-byte key, got ${key.length} bytes`);
  }
  return { key };
}

export function generateKey(): CryptoKey {
  return { key: randomBytes(KEY_LEN) };
}

export function encrypt(plaintext: string, k: CryptoKey): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", k.key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(blob: string, k: CryptoKey): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("vault: malformed ciphertext");
  }
  const iv = Buffer.from(parts[1] ?? "", "base64");
  const tag = Buffer.from(parts[2] ?? "", "base64");
  const ct = Buffer.from(parts[3] ?? "", "base64");
  if (iv.length !== IV_LEN) throw new Error("vault: bad iv length");
  if (tag.length !== TAG_LEN) throw new Error("vault: bad tag length");
  const decipher = createDecipheriv("aes-256-gcm", k.key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
