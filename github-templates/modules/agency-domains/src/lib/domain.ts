// Agency-domains skeleton domain.

import type { ClientId, UserId } from "./tenancy";

export type DomainStatus = "pending" | "verifying" | "active" | "failed";

export const STATUS_LABELS: Record<DomainStatus, string> = {
  pending: "Pending — waiting on operator", verifying: "Verifying DNS",
  active: "Active", failed: "Failed",
};

// Allowed transitions. Operator manually flips to verifying once the
// client has set their DNS records; T6 webhook (future) flips to
// active or failed. Re-trying after a failure goes back to verifying.
export const STATUS_TRANSITIONS: Record<DomainStatus, DomainStatus[]> = {
  pending: ["verifying", "failed"],
  verifying: ["active", "failed"],
  failed: ["verifying", "pending"],
  active: ["failed"],
};

// NS record contract — the operator-facing copy that explains what
// the client must set on their registrar. Hardcoded per provider for
// v1; T6 wires real provider lookup.
export interface NsRecord {
  name: string;          // e.g. "@" or "_aqua-verify"
  type: "CNAME" | "TXT" | "A" | "NS";
  value: string;
  ttl?: number;
  notes?: string;
}

export interface DomainAttach {
  id: string;
  agencyId: string;
  clientId: ClientId;
  hostname: string;            // normalised lowercase
  status: DomainStatus;
  nsRecords: NsRecord[];
  verifiedAt?: number;
  lastError?: string;
  createdBy?: UserId;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDomainAttachInput {
  hostname: string;
  nsRecords?: NsRecord[];      // optional override; defaults to standard Aqua records
}

export interface UpdateDomainAttachPatch {
  hostname?: string;
  nsRecords?: NsRecord[];
}

export function normaliseHostname(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isValidHostname(host: string): boolean {
  // RFC 1123-ish: labels separated by dots, alphanum + hyphen, no
  // leading/trailing hyphen per label, total ≤253 chars.
  if (!host || host.length > 253) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host);
}

export function defaultNsRecords(hostname: string): NsRecord[] {
  return [
    {
      name: "@", type: "A", value: "76.76.21.21",
      notes: "Apex A record — points to Aqua's edge proxy.",
    },
    {
      name: "www", type: "CNAME", value: `${hostname}.aqua.app`,
      notes: "www subdomain — same target. Optional but recommended.",
    },
    {
      name: "_aqua-verify", type: "TXT", value: `aqua-verify=${hostname}`,
      notes: "Ownership-proof TXT record. Required to flip status from pending → verifying.",
    },
  ];
}
