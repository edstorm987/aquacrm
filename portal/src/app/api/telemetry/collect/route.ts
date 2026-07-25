import { NextResponse, type NextRequest } from "next/server";
import { recordClientTelemetry } from "@/lib/server/clientTelemetry";
import { ensureHydrated } from "@/server/storage";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 32_768) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413, headers: CORS_HEADERS });
  }

  const raw = await req.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400, headers: CORS_HEADERS });
  }
  const siteKey = typeof body.siteKey === "string" ? body.siteKey.trim() : "";
  if (!siteKey) {
    return NextResponse.json({ ok: false, error: "siteKey required" }, { status: 400, headers: CORS_HEADERS });
  }

  const recorded = recordClientTelemetry(siteKey, body, req.headers.get("user-agent") ?? undefined);
  if (!recorded) {
    return NextResponse.json({ ok: false, error: "unknown site" }, { status: 404, headers: CORS_HEADERS });
  }
  if (recorded.status === "rate-limited") {
    return NextResponse.json({ ok: false, error: "signal limit reached" }, { status: 429, headers: CORS_HEADERS });
  }
  return NextResponse.json({ ok: true }, { status: 202, headers: CORS_HEADERS });
}
