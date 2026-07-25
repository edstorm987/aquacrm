// Domain model — what's persisted per-install for each attached
// hostname.
//
// One install can hold many domains (e.g. apex + www, or a primary
// domain + a couple of redirects). `vercelProjectId` is attached at
// the record level so a single agency-scoped install can manage
// domains across multiple per-client Vercel projects.

import type { AgencyId, ClientId } from "./tenancy";

export type DomainStatus =
  // Vercel hasn't acknowledged the attach yet, or DNS hasn't propagated.
  | "pending"
  // Vercel reports the domain as verified.
  | "verified"
  // Vercel returned an error on attach OR a verify check failed.
  | "error";

export interface DnsRequirement {
  // The DNS record type the operator must add — typically "TXT" or "CNAME".
  type: string;
  // Hostname the record applies to. May be the apex or a subdomain.
  name: string;
  // The value Vercel expects at that record.
  value: string;
  // Vercel-supplied human-readable reason (e.g. "DNS not propagated").
  reason?: string;
}

export interface DomainRecord {
  id: string;
  agencyId: AgencyId;
  // Optional — set when the domain is attached to a per-client Vercel
  // project. Unset for agency-level domains (e.g. milesymedia.com main).
  clientId?: ClientId;
  hostname: string;                // normalised lowercase
  vercelProjectId: string;
  vercelTeamId?: string;
  status: DomainStatus;
  // Last DNS requirements Vercel handed back. Empty when verified.
  pending: DnsRequirement[];
  // Human-readable error from the last failed attach/verify.
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  // Last attempted verify (whether it succeeded or not).
  lastCheckedAt?: number;
  // Convenience: capture who attached the domain so the activity log
  // and admin UI can show provenance.
  attachedBy?: string;
}

// User-facing inputs — what flows in over the API.

export interface AttachDomainInput {
  hostname: string;
  vercelProjectId: string;
  vercelTeamId?: string;
}

export interface DomainListFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
}

// Normalize what the user typed before persistence + Vercel API call.
// Strips protocol + trailing path; forces lowercase. Same as 02.
export function normaliseHostname(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}
