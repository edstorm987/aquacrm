import { NextResponse } from "next/server";

import { runEdits } from "@/engines/editor/editing/engine";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { appConfigEditAdapter, prepareAppConfigIntents } from "@/lib/server/editing/appConfigAdapter";
import { getAgency } from "@/server/tenants";
import { ensureDevTeamWorkspaceHydrated } from "@/lib/server/dev/devWorkspaceFiles";
import { AGENCY_ROLES } from "@/server/types";

// The Dev Team Editor's write path. One POST that both previews and applies —
// same request shape, same plan, different `confirm` — because the operator must
// be able to confirm the thing they were actually shown.
//
// The gate is asserted here as well as on the page. A page gate protects a
// screen; this protects the write, and this is the only thing standing between
// a fetch and the agency's persisted brand.
export const dynamic = "force-dynamic";

// A generous ceiling on a form that has ~15 fields — enough that a real edit
// never hits it, small enough that a loop cannot make the server plan forever.
const MAX_INTENTS = 64;
const MAX_VALUE_LENGTH = 4_000;

interface RawIntent {
  targetId: string;
  expectedFingerprint: string;
  value: string;
}

function parseIntents(input: unknown): RawIntent[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_INTENTS) return null;
  const parsed: RawIntent[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") return null;
    const { targetId, expectedFingerprint, value } = entry as Record<string, unknown>;
    if (typeof targetId !== "string" || typeof expectedFingerprint !== "string" || typeof value !== "string") return null;
    if (value.length > MAX_VALUE_LENGTH) return null;
    parsed.push({ targetId, expectedFingerprint, value });
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    await ensureDevTeamWorkspaceHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    // Founder-only Dev Team access, or this endpoint does not exist — matching the page,
    // which 404s rather than 403s so the surface is not even advertised.
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    // The agency comes from the session and only from the session. A body
    // field named `agencyId` is ignored, because a founder-only editor that
    // takes its tenant from the request is a founder-only editor for every
    // tenant.
    const agencyId = session.agencyId;
    if (!getAgency(agencyId)) {
      return NextResponse.json({ ok: false, error: "workspace not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null) as { intents?: unknown; confirm?: unknown } | null;
    const raw = parseIntents(body?.intents);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Send between 1 and 64 well-formed edits." }, { status: 400 });
    }

    const adapter = appConfigEditAdapter({ agencyId, actorUserId: session.userId });

    // Normalise + validate before the engine sees anything, so the previewed
    // diff is the value that will really be stored and a value the storage
    // cleaners would silently discard is refused out loud instead.
    //
    // The mapped document goes in too, so an edit that normalises back to the
    // value already stored (a trailing space, a case-only retype) is DROPPED
    // rather than reaching the engine as a `no-change` rejection — which, under
    // the deliberate all-or-nothing rule, would take every other valid edit in
    // the batch down with it.
    const { intents, invalid, skipped } = prepareAppConfigIntents(raw, await adapter.map());
    if (invalid.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Some values need fixing — nothing was changed.", invalid },
        { status: 422 },
      );
    }

    const outcome = await runEdits({
      adapter,
      intents,
      // Strictly the boolean `true`, never a truthy string from JSON. The engine
      // checks `confirm !== true` as well; both locks are deliberate, because
      // the failure mode is a silent write nobody asked for.
      confirm: body?.confirm === true,
    });

    // `skipped` is reported, not hidden: the operator asked for those fields and
    // is entitled to know they needed nothing doing.
    return NextResponse.json({ ok: true, outcome, skipped });
  } catch (error) {
    return authErrorResponse(error);
  }
}
