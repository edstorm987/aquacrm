import { NextResponse, type NextRequest } from "next/server";
import { createAquaEmbedToken, matchesEmbedApiToken, type AquaEmbedMode } from "@/lib/server/aquaEmbedToken";
import { ensureHydrated } from "@/server/storage";
import { getClient } from "@/server/tenants";

export const dynamic = "force-dynamic";

function bearerToken(req: NextRequest) {
  const value = req.headers.get("authorization") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function safeOrigin(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  if (!matchesEmbedApiToken(bearerToken(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  let body: { clientId?: unknown; mode?: unknown; email?: unknown; name?: unknown; origin?: unknown };
  try {
    body = await req.json() as {
      clientId?: unknown;
      mode?: unknown;
      email?: unknown;
      name?: unknown;
      origin?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const mode: AquaEmbedMode = body.mode === "admin" ? "admin" : "client";
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }

  await ensureHydrated();
  const client = getClient(clientId);
  if (!client || client.status === "archived") {
    return NextResponse.json({ ok: false, error: "Client record not found." }, { status: 404 });
  }

  const issued = createAquaEmbedToken({
    clientId,
    mode,
    email: typeof body.email === "string" ? body.email : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    origin: safeOrigin(body.origin),
  });
  const url = new URL("/api/v1/embed/consume", req.nextUrl.origin);
  url.searchParams.set("token", issued.token);
  const embedUrl = new URL("/embed/account", req.nextUrl.origin);
  embedUrl.searchParams.set("token", issued.token);

  return NextResponse.json({
    ok: true,
    url: url.toString(),
    embedUrl: embedUrl.toString(),
    expiresAt: issued.expiresAt,
    client: { id: client.id, name: client.name },
  });
}
