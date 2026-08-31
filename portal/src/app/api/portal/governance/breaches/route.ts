import { NextResponse } from "next/server";

import { authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import {
  assessBreachIncident,
  closeBreachIncident,
  recordAuthorityNotification,
  recordBreachIncident,
  recordSubjectNotification,
  BreachRegisterError,
  BREACH_REFUSAL_MESSAGES,
} from "@/lib/server/compliance/breachRegister";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listTradingCompanies } from "@/server/tradingCompanies";

export const runtime = "nodejs";

/**
 * The breach register (GDPR Art. 33/34).
 *
 * `compliancePosture` named the gap this closes exactly: *"There is no breach
 * register. If something happened tonight there is nowhere in the app to
 * record it and no clock counting the 72 hours."*
 *
 * ── What this route does NOT do ───────────────────────────────────────────
 *
 * It never notifies anybody. The supervisory authority is told on the
 * authority's own service and the affected people are told by whatever channel
 * suits them; both are human acts. This route records that they happened, so
 * the register can stop counting — which is the opposite of, and must never be
 * mistaken for, doing them.
 *
 * ── Who can do what ──────────────────────────────────────────────────────
 *
 * `record` and the two notification records are owner-or-manager, matching the
 * rest of Governance: a breach found at 11pm must be loggable by whoever found
 * it, and making the clock wait for the owner to be free is the exact failure
 * the 72 hours exist to prevent.
 *
 * `assess` and `close` are OWNER-only. Deciding a breach is not notifiable is a
 * legal judgement with the regulator on the other end of it, and closing is
 * what takes an incident off the clock. Those sit with the erase button, not
 * with the reports.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";

    // Owner-only actions are gated by their own requireRole below, so the
    // broader gate here is deliberately the read-level one.
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const agencyId = getActiveAgencyId(session);

    switch (action) {
      case "record": {
        const title = typeof body?.title === "string" ? body.title.trim() : "";
        const description = typeof body?.description === "string" ? body.description.trim() : "";
        if (!title) return NextResponse.json({ ok: false, error: "Give the incident a short name." }, { status: 400 });
        if (!description) {
          return NextResponse.json({
            ok: false,
            error: "Describe what happened. Art. 33(5) requires the facts of every breach to be documented, including the ones you decide not to notify.",
          }, { status: 400 });
        }

        const companyId = typeof body?.companyId === "string" && body.companyId ? body.companyId : null;
        if (companyId && !listTradingCompanies(agencyId, true).some(company => company.id === companyId)) {
          return NextResponse.json({ ok: false, error: "That company was not found." }, { status: 404 });
        }

        const discoveredAtRaw = body?.discoveredAt;
        const discoveredAt = typeof discoveredAtRaw === "number" && Number.isFinite(discoveredAtRaw)
          ? discoveredAtRaw
          : typeof discoveredAtRaw === "string" && discoveredAtRaw
            ? Date.parse(discoveredAtRaw)
            : Date.now();
        if (!Number.isFinite(discoveredAt)) {
          return NextResponse.json({ ok: false, error: "That discovery date could not be read." }, { status: 400 });
        }

        const incident = recordBreachIncident({
          agencyId,
          companyId,
          title,
          description,
          discoveredAt,
          dataCategories: Array.isArray(body?.dataCategories)
            ? (body.dataCategories as unknown[]).filter((item): item is string => typeof item === "string")
            : [],
          affectedEstimate: typeof body?.affectedEstimate === "number" ? body.affectedEstimate : undefined,
          createdBy: session.userId,
        });

        logActivity({
          agencyId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "tenant",
          action: "breach.recorded",
          message: "A personal-data breach was recorded on the register.",
          // The incident id and the dates only. The description can name
          // categories of people; it must not reach the audit log, which is
          // read far more widely than the register.
          metadata: { incidentId: incident.id, discoveredAt: incident.discoveredAt, notifyDeadlineAt: incident.notifyDeadlineAt },
        });
        await flushPendingWrites();

        return NextResponse.json({
          ok: true,
          incident,
          notice: `Recorded. The 72-hour clock runs from when you became aware, so the supervisory-authority deadline is ${new Date(incident.notifyDeadlineAt).toISOString()}. This app has notified nobody — that is still yours to do.`,
        });
      }

      case "assess": {
        // Owner-only: see the header note.
        await requireRole("agency-owner");
        const id = typeof body?.incidentId === "string" ? body.incidentId : "";
        if (typeof body?.notifiable !== "boolean") {
          return NextResponse.json({ ok: false, error: "Say whether this is notifiable to the supervisory authority." }, { status: 400 });
        }
        const updated = assessBreachIncident(agencyId, id, session.userId, body.notifiable, String(body?.reason ?? ""));
        if (!updated) return NextResponse.json({ ok: false, error: "That incident was not found." }, { status: 404 });

        logActivity({
          agencyId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "tenant",
          action: "breach.assessed",
          message: `A breach was assessed as ${body.notifiable ? "notifiable" : "not notifiable"}.`,
          metadata: { incidentId: updated.id, notifiable: body.notifiable },
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          incident: updated,
          notice: body.notifiable
            ? "Recorded as notifiable. The deadline still runs from discovery — recording the decision is not the notification."
            : "Recorded as not notifiable, with your reason. Art. 33(5) keeps this on the register precisely so that decision can be checked.",
        });
      }

      case "notify-authority": {
        const id = typeof body?.incidentId === "string" ? body.incidentId : "";
        const updated = recordAuthorityNotification(agencyId, id, session.userId, {
          notifiedAt: typeof body?.notifiedAt === "number" ? body.notifiedAt : undefined,
          reference: typeof body?.reference === "string" ? body.reference : undefined,
          delayReason: typeof body?.delayReason === "string" ? body.delayReason : undefined,
        });
        if (!updated) return NextResponse.json({ ok: false, error: "That incident was not found." }, { status: 404 });

        logActivity({
          agencyId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "tenant",
          action: "breach.authority_notified",
          message: "A supervisory-authority notification was recorded against a breach.",
          metadata: { incidentId: updated.id, notifiedAt: updated.authorityNotifiedAt, late: Boolean(updated.delayReason) },
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          incident: updated,
          notice: updated.delayReason
            ? "Recorded — after the 72-hour deadline, with your reason for the delay. The register keeps it marked late; that does not go away."
            : "Recorded, inside the 72 hours.",
        });
      }

      case "notify-subjects": {
        const id = typeof body?.incidentId === "string" ? body.incidentId : "";
        const updated = recordSubjectNotification(agencyId, id, session.userId,
          typeof body?.notifiedAt === "number" ? body.notifiedAt : undefined);
        if (!updated) return NextResponse.json({ ok: false, error: "That incident was not found." }, { status: 404 });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, incident: updated, notice: "Recorded that the affected people were told (Art. 34)." });
      }

      case "close": {
        // Owner-only: closing is what takes an incident off the clock.
        await requireRole("agency-owner");
        const id = typeof body?.incidentId === "string" ? body.incidentId : "";
        const updated = closeBreachIncident(agencyId, id, session.userId, String(body?.outcome ?? ""));
        if (!updated) return NextResponse.json({ ok: false, error: "That incident was not found." }, { status: 404 });

        logActivity({
          agencyId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "tenant",
          action: "breach.closed",
          message: "A breach incident was closed.",
          metadata: { incidentId: updated.id },
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, incident: updated, notice: "Closed. It stays on the register — Art. 33(5) documentation does not get deleted when the response finishes." });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof BreachRegisterError) {
      return NextResponse.json({ ok: false, error: BREACH_REFUSAL_MESSAGES[error.code], code: error.code }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}

