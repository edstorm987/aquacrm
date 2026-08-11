import "server-only";

import crypto from "node:crypto";

function vaultKey(): Buffer {
  const source = process.env.PORTAL_VAULT_ENCRYPTION_KEY?.trim();
  if (!source && process.env.NODE_ENV === "production") {
    throw new Error("vault_not_configured");
  }
  return crypto.createHash("sha256")
    .update(source || "aquacrm-local-integration-vault-development-key")
    .digest();
}

export function encryptInboxSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}

export function decryptInboxSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("inbox_secret_invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
