import "server-only";

// Server-owned, operator-only approval that binds a tested+active client-supabase
// connection to exactly ONE site for pilot form export/intake.
//
// This is the ONLY path that flips a connection from "inert export" to "emits the
// Edge Function endpoint". It is deliberately NOT a catalogue field, so it can
// never be set through the connection form or any request/query input; it stores
// its state in a reserved `config` key that `saveIntegrationConnection` preserves
// but cannot write. Default is unapproved (fail-closed), and it requires the
// connection to have PASSED its test and be ACTIVE first. Revocation (or deleting
// the connection) makes already-deployed forms stop submitting.

import { getIntegrationConnection } from "@/lib/server/integrations/integrationConnections";
import { INTAKE_APPROVED_SITE_KEY } from "./clientSupabaseConnection";
import { mutate } from "@/server/storage";
import { logActivity } from "@/server/activity";

const APPROVED_AT_KEY = "intakeApprovedAt";

export function approveClientFormIntake(input: {
  agencyId: string;
  connectionId: string;
  siteId: string;
  actorUserId: string;
  actorEmail?: string;
}): void {
  const connection = getIntegrationConnection(input.agencyId, input.connectionId);
  if (!connection || connection.provider !== "client-supabase") throw new Error("integration_not_found");
  if (!connection.clientId) throw new Error("client_supabase_requires_client_scope");
  // Active + tested is the "connection is active and tested" precondition; the
  // approval is the SEPARATE, deliberate operator step on top of it.
  if (connection.lastTestStatus !== "passed" || connection.isActive !== true) {
    throw new Error("connection_must_be_tested_and_active");
  }
  const siteId = input.siteId.trim();
  if (!siteId) throw new Error("site_required");
  mutate((state) => {
    const c = state.integrationConnections[input.connectionId];
    if (!c) return;
    c.config = { ...c.config, [INTAKE_APPROVED_SITE_KEY]: siteId, [APPROVED_AT_KEY]: String(Date.now()) };
    c.updatedBy = input.actorUserId;
    c.updatedAt = Date.now();
  });
  logActivity({
    agencyId: input.agencyId,
    clientId: connection.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: "integration.updated",
    message: `Approved client Supabase form intake for site “${siteId}”.`,
    metadata: { connectionId: input.connectionId, siteId, intakeApproved: true },
  });
}

export function revokeClientFormIntakeApproval(input: {
  agencyId: string;
  connectionId: string;
  actorUserId: string;
  actorEmail?: string;
}): void {
  const connection = getIntegrationConnection(input.agencyId, input.connectionId);
  if (!connection) throw new Error("integration_not_found");
  mutate((state) => {
    const c = state.integrationConnections[input.connectionId];
    if (!c) return;
    const next = { ...c.config };
    delete next[INTAKE_APPROVED_SITE_KEY];
    delete next[APPROVED_AT_KEY];
    c.config = next;
    c.updatedBy = input.actorUserId;
    c.updatedAt = Date.now();
  });
  logActivity({
    agencyId: input.agencyId,
    clientId: connection.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: "integration.updated",
    message: "Revoked client Supabase form intake approval.",
    metadata: { connectionId: input.connectionId, intakeApproved: false },
  });
}
