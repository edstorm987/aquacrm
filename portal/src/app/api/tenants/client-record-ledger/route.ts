import { NextResponse } from "next/server";

import {
  queryClientRecordLedger,
  type ClientRecordLedgerFilter,
  type ClientRecordLedgerScope,
  type ClientRecordLedgerSort,
  type ClientRecordLedgerWindow,
} from "@/lib/server/clientRecordLedger";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { listClientRelationshipWorkspaces } from "@/server/clientRelationships";
import { AGENCY_ROLES } from "@/server/types";

export const dynamic = "force-dynamic";

const FILTERS = new Set<ClientRecordLedgerFilter>(["all", "messages", "notes", "calls", "commercial", "delivery", "files", "activity"]);
const SCOPES = new Set<ClientRecordLedgerScope>(["all", "client", "canonical", "attention"]);
const WINDOWS = new Set<ClientRecordLedgerWindow>(["all", "30d", "90d", "year"]);
const SORTS = new Set<ClientRecordLedgerSort>(["newest", "oldest"]);

function oneOf<T extends string>(value: string | null, allowed: Set<T>, fallback: T): T {
  return value && allowed.has(value as T) ? value as T : fallback;
}

export async function GET(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId")?.trim().slice(0, 120) ?? "";
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    const relationshipView = url.searchParams.get("relationship") === "1";
    const clientIds = relationshipView
      ? listClientRelationshipWorkspaces(session.agencyId, clientId).map(workspace => workspace.id)
      : [clientId];
    const page = queryClientRecordLedger({
      agencyId: session.agencyId,
      clientId,
      clientIds,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: Number(url.searchParams.get("limit")) || 25,
      filter: oneOf(url.searchParams.get("filter"), FILTERS, "all"),
      scope: oneOf(url.searchParams.get("scope"), SCOPES, "all"),
      timeWindow: oneOf(url.searchParams.get("timeWindow"), WINDOWS, "all"),
      sort: oneOf(url.searchParams.get("sort"), SORTS, "newest"),
      query: url.searchParams.get("query")?.slice(0, 500),
      parentSourceId: url.searchParams.get("parentSourceId")?.slice(0, 240),
    });
    return NextResponse.json({ ok: true, page });
  } catch (error) {
    return authErrorResponse(error);
  }
}
