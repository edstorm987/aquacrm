// Threat centre — the honest security posture read (Phase 6).
//
// Owner-only. Reports the REAL state of every shipped control: switch
// positions, epochs, suspensions, the session registry, the durable
// control-action record, and — critically — what the platform CANNOT see
// right now (BLIND items). A security page that hides its blind spots is a
// dashboard; this one says "no scanner is connected" in so many words.

import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { isPlatformOperator } from "@/lib/server/auth/founderAgency";
import { readSecurityControl } from "@/lib/server/auth/securityControl";
import { hasContentScanner } from "@/lib/server/security/contentTrust";
import { hasSecurityEventDrain, recentSecurityEvents } from "@/lib/server/security/securityEvents";
import { ensureHydrated, getState } from "@/server/storage";

export const dynamic = "force-dynamic";

export interface SecurityPostureItem {
  id: string;
  label: string;
  /** "enforced" = live and tested; "blind" = the platform cannot see this; "owner" = exists but needs an owner step. */
  status: "enforced" | "blind" | "owner";
  detail: string;
}

export async function GET(): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole("agency-owner");
    const control = readSecurityControl();
    const agencyId = session.agencyId ?? "";
    // TENANT SCOPE: a customer tenant's owner sees THEIR OWN tenant's
    // security data. Only the platform operator's owner sees across tenants —
    // suspended users elsewhere, other tenants' sessions and events are not
    // this owner's to read.
    // Operator authority is USER-specific (Item 2), not founder-agency membership.
    const operator = isPlatformOperator({ email: session.email });
    const ownUserIds = new Set(
      Object.values(getState().users)
        .filter(user => user.agencyId === agencyId || Boolean(agencyId && user.agencyIds?.includes(agencyId)))
        .map(user => user.id),
    );
    const inScopeUser = (userId: string) => operator || ownUserIds.has(userId);

    const sessions = Object.values(control.sessions)
      .filter(record => operator || record.agencyId === agencyId || inScopeUser(record.userId));
    const activeSessions = sessions.filter(record => !record.revokedAt);
    const scopedEvent = (event: { tenantId?: string }) => operator || event.tenantId === agencyId;

    const posture: SecurityPostureItem[] = [
      { id: "write-freeze", label: "Emergency write freeze", status: "enforced", detail: control.globalReadOnly ? `ON since ${new Date(control.globalReadOnly.at).toISOString()} (${control.globalReadOnly.reason})` : "Ready. One action freezes every write while reads keep serving." },
      { id: "session-gate", label: "Per-request session gate", status: "enforced", detail: "Suspension, revocation, epochs and tenant lockdown are checked on every authenticated request." },
      { id: "egress", label: "Outbound request broker", status: "enforced", detail: "Webhooks, integrations, form reads, shop domains and SMTP hosts are vetted and pinned before any connection." },
      { id: "uploads", label: "Upload content judgement", status: "enforced", detail: "Every stored file is judged by its bytes at the storage choke point; executables and polyglots are refused." },
      { id: "scanner", label: "Malware scanning", status: hasContentScanner() ? "enforced" : "blind", detail: hasContentScanner() ? "An external scanner is connected." : "NO scanner is connected — upload verdicts are content-signature checks only. Connect an AV/CDR engine." },
      { id: "event-drain", label: "Off-platform event archive", status: hasSecurityEventDrain() ? "enforced" : "blind", detail: hasSecurityEventDrain() ? "Events also stream off-platform." : "Events live in this app only (bounded ring + the durable action record). An attacker with host access could hide their traces — connect an off-platform drain." },
      { id: "backup", label: "Restore capability", status: "owner", detail: "The encrypted backup lane exists but the restore drill has not been run. Until it has, recovery time is UNMEASURED." },
      { id: "db-migration", label: "Database containment migration", status: "owner", detail: "Cannot be verified from inside the app. Run supabase/rls-verify.sql against production and confirm the containment invariants are all-INFO." },
    ];

    return NextResponse.json({
      ok: true,
      viewer: { userId: session.userId, agencyId: session.agencyId, operator },
      switches: {
        // Global switch POSITIONS are observable app-wide anyway (writes fail /
        // AI refuses); the reason+actor detail is the operator's.
        globalReadOnly: control.globalReadOnly ? (operator ? control.globalReadOnly : { active: true, at: control.globalReadOnly.at }) : null,
        aiDisabled: control.aiDisabled ? (operator ? control.aiDisabled : { active: true, at: control.aiDisabled.at }) : null,
        tenantLockdowns: operator
          ? (control.tenantLockdowns ?? {})
          : Object.fromEntries(Object.entries(control.tenantLockdowns ?? {}).filter(([id]) => id === agencyId)),
      },
      epochs: {
        global: control.globalEpoch,
        tenant: control.tenantEpochs[agencyId] ?? 0,
      },
      suspendedUsers: Object.entries(control.suspendedUsers)
        .filter(([userId]) => inScopeUser(userId))
        .map(([userId, record]) => ({ userId, ...record })),
      sessions: {
        recorded: sessions.length,
        active: activeSessions.length,
        recent: activeSessions
          .sort((a, b) => b.issuedAt - a.issuedAt)
          .slice(0, 20)
          .map(record => ({ sid: record.sid, userId: record.userId, role: record.role, issuedAt: record.issuedAt, issuedVia: record.issuedVia, lastSeenAt: record.lastSeenAt })),
      },
      // Durable action record first (survives restarts), then the in-memory
      // telemetry tail — labelled so the UI can say which is which.
      durableActions: (control.recentEvents ?? []).filter(scopedEvent).slice(-50).reverse(),
      telemetryTail: recentSecurityEvents(200).filter(scopedEvent).slice(0, 50),
      posture,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: "overview_failed" }, { status: 500 });
  }
}
