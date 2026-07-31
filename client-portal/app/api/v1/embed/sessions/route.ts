import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createPortalSession, type PortalRole } from "@/lib/auth";
import { cleanString, jsonError, jsonOk, safeInternalPath } from "@/lib/route-security";

export const dynamic = "force-dynamic";

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readBearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}

function requestOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_AQUA_CRM_URL?.trim();
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const expectedToken = process.env.AQUA_EMBED_API_TOKEN?.trim()
    || (process.env.NODE_ENV === "production" ? "" : "local-aqua-embed");
  const suppliedToken = readBearer(request);

  if (!expectedToken || !suppliedToken || !safeEqual(suppliedToken, expectedToken)) {
    return jsonError("Unauthorised.", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("Invalid request.", 400);
  }

  const mode = cleanString(body.mode, 20) === "admin" ? "admin" : "client";
  const role: PortalRole = mode === "admin" ? "admin" : "client";
  const email = cleanString(body.email, 254).toLowerCase()
    || (role === "admin" ? "edwardhallam07@gmail.com" : "client@milesymedia.local");
  const name = cleanString(body.name, 120)
    || (role === "admin" ? "Ed" : "Aqua client");
  const next = safeInternalPath(cleanString(body.next, 300), "/portal");

  const handoffToken = createPortalSession({ email, name, role });
  const url = new URL("/api/v1/embed/open", requestOrigin(request));
  url.searchParams.set("token", handoffToken);
  url.searchParams.set("next", next);

  return jsonOk({
    url: url.toString(),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });
}
