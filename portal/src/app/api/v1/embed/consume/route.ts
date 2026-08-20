import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAquaEmbedToken } from "@/lib/server/aquaEmbedToken";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getClient } from "@/server/tenants";
import {
  createUser,
  getUser,
  listUsersForAgency,
  listUsersForClient,
} from "@/server/users";

export const dynamic = "force-dynamic";

function errorRedirect(request: NextRequest, message: string) {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

function clientUser(input: {
  clientId: string;
  agencyId: string;
  clientName: string;
  email?: string;
  name?: string;
}) {
  const requestedEmail = input.email?.trim().toLowerCase();
  const exact = requestedEmail
    ? getUser(requestedEmail, { role: "end-customer", clientId: input.clientId })
    : null;
  if (exact?.role === "end-customer") return exact;

  const existing = listUsersForClient(input.clientId)
    .find(user => user.role === "end-customer");
  if (existing) return existing;

  return createUser({
    email: requestedEmail || `portal-${input.clientId}@access.aqua.local`,
    password: `${randomBytes(24).toString("base64url")}Aa1!`,
    name: input.name || `${input.clientName} client`,
    role: "end-customer",
    agencyId: input.agencyId,
    clientId: input.clientId,
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyAquaEmbedToken(token);
  if (!payload) {
    return errorRedirect(request, "This Aqua access link has expired. Open Aqua from your client portal again.");
  }

  await ensureHydrated();
  const client = getClient(payload.clientId);
  if (!client || client.status === "archived") {
    return errorRedirect(request, "The linked Aqua client is unavailable.");
  }

  const user = payload.mode === "admin"
    ? listUsersForAgency(client.agencyId).find(candidate => candidate.role === "agency-owner")
      ?? listUsersForAgency(client.agencyId).find(candidate => candidate.role === "agency-manager")
    : clientUser({
        clientId: client.id,
        agencyId: client.agencyId,
        clientName: client.name,
        email: payload.email,
        name: payload.name,
      });

  if (!user) {
    return errorRedirect(request, "No Aqua administrator is configured for this workspace.");
  }

  const session = issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: client.agencyId,
    clientId: user.role === "end-customer" ? client.id : user.clientId,
    sessionRev: user.sessionRev ?? 0,
  });
  const cookie = sessionCookie(session);
  const destination = payload.mode === "admin"
    ? `/portal/clients/${encodeURIComponent(client.id)}?tab=portal`
    : "/portal/customer";
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
