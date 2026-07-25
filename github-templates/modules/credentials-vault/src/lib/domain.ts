// Credentials vault domain types.

import type { ClientId, UserId } from "./tenancy";

export type CredentialType = "login" | "api-key" | "2fa-recovery" | "note";

export const CREDENTIAL_TYPES: readonly CredentialType[] = [
  "login", "api-key", "2fa-recovery", "note",
] as const;

export const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  login: "Login",
  "api-key": "API Key",
  "2fa-recovery": "2FA Recovery",
  note: "Access Note",
};

// Encrypted blob shape — produced by `encrypt()` / consumed by
// `decrypt()`. Stored on the Credential row in place of the raw
// password / secret. Format `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`.
export type EncryptedField = string;

export interface Credential {
  id: string;
  agencyId: string;
  clientId?: ClientId;          // undefined → agency-wide credential
  label: string;
  type: CredentialType;
  url?: string;
  username?: string;
  // Encrypted at rest. Empty string when type === "note" and no
  // secret is set; "note" type uses `notes` for the body.
  password?: EncryptedField;
  notes?: string;
  tags: string[];
  lastRotated?: number;
  sharedWith: UserId[];          // [] = visible only to admins
  archived: boolean;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCredentialInput {
  label: string;
  type: CredentialType;
  clientId?: ClientId;
  url?: string;
  username?: string;
  password?: string;             // PLAINTEXT — encrypted on write
  notes?: string;
  tags?: string[];
  sharedWith?: UserId[];
}

export interface UpdateCredentialPatch {
  label?: string;
  url?: string;
  username?: string;
  password?: string;             // PLAINTEXT or undefined; "" clears
  notes?: string;
  tags?: string[];
  sharedWith?: UserId[];
  rotateNow?: boolean;
}

export interface CredentialFilter {
  type?: CredentialType;
  clientId?: ClientId | null;     // null = agency-wide only
  query?: string;
  includeArchived?: boolean;
}

export interface CredentialSummary {
  id: string;
  label: string;
  type: CredentialType;
  clientId?: ClientId;
  url?: string;
  username?: string;
  notes?: string;
  tags: string[];
  lastRotated?: number;
  sharedWith: UserId[];
  hasSecret: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export function summarise(c: Credential): CredentialSummary {
  return {
    id: c.id,
    label: c.label,
    type: c.type,
    clientId: c.clientId,
    url: c.url,
    username: c.username,
    notes: c.notes,
    tags: c.tags,
    lastRotated: c.lastRotated,
    sharedWith: c.sharedWith,
    hasSecret: !!c.password,
    archived: c.archived,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
