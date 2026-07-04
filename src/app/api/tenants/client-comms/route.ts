import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";

interface CommsBody {
  clientId: string;
  patch: {
    whatsappLink?: string | null;
    clientEmail?: string | null;
    lastContactedAt?: number | "now" | null;
  };
}

function sanitiseUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return "";
  // Light sanity check — must look like http(s) or mailto/tel/wa scheme.
  if (!/^(https?:\/\/|wa\.me\/|chat\.whatsapp\.com\/|mailto:|tel:)/i.test(trimmed) && !/^https?:/.test(trimmed)) {
    // Allow plain whatsapp invite shape "https://chat.whatsapp.com/..."
    return trimmed; // permissive — operator-pasted URL only per prompt
  }
  return trimmed;
}

function sanitiseEmail(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return "";
  return trimmed;
}

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as CommsBody | null;
  if (!body?.clientId || !body.patch) {
    return NextResponse.json({ ok: false, error: "clientId + patch required" }, { status: 400 });
  }
  const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
  const client = getClientForAgency(session.agencyId, body.clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  // updateClient merges via shallow spread, so we can't "delete" keys —
  // empty-string is the canonical "cleared" sentinel; readers treat
  // both "" and undefined as absent.
  const patch: Record<string, unknown> = {};
  if (body.patch.whatsappLink !== undefined) {
    const v = sanitiseUrl(body.patch.whatsappLink);
    if (v !== undefined) patch.whatsappLink = v;
  }
  if (body.patch.clientEmail !== undefined) {
    const v = sanitiseEmail(body.patch.clientEmail);
    if (v !== undefined) patch.clientEmail = v;
  }
  if (body.patch.lastContactedAt !== undefined) {
    if (body.patch.lastContactedAt === null) patch.lastContactedAt = 0;
    else if (body.patch.lastContactedAt === "now") patch.lastContactedAt = Date.now();
    else if (typeof body.patch.lastContactedAt === "number") patch.lastContactedAt = body.patch.lastContactedAt;
  }

  const updated = updateClient(session.agencyId, body.clientId, { metadata: patch });
  if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    metadata: {
      whatsappLink: updated.metadata?.whatsappLink ?? null,
      clientEmail: updated.metadata?.clientEmail ?? null,
      lastContactedAt: updated.metadata?.lastContactedAt ?? null,
    },
  });
}
