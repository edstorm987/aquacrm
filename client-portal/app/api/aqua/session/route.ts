import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/route-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) return jsonError("Unauthorised.", 401);

  const aquaUrl = process.env.AQUA_CRM_URL?.trim() || "https://aqua-crm.com";
  const apiToken = process.env.AQUA_EMBED_API_TOKEN?.trim()
    || (process.env.NODE_ENV === "production" ? "" : "local-aqua-embed");
  const clientId = process.env.AQUA_CLIENT_ID?.trim()
    || (process.env.NODE_ENV === "production" ? "" : "cli_9f193adf02d07d4c");
  if (!apiToken || !clientId) {
    return jsonError("This portal has not been linked to Aqua yet.", 503);
  }

  try {
    const response = await fetch(new URL("/api/v1/embed/sessions", aquaUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        mode: session.role === "admin" ? "admin" : "client",
        origin: new URL(request.url).origin,
      }),
      cache: "no-store",
    });
    const body = await response.json() as { ok?: boolean; url?: string; expiresAt?: number; error?: string };
    if (!response.ok || !body.url) {
      return jsonError("Aqua did not accept the portal link.", response.status || 502);
    }
    return jsonOk({ url: body.url, expiresAt: body.expiresAt ?? null });
  } catch {
    return jsonError("AquaCRM is not reachable. Check that its server is running.", 502);
  }
}
