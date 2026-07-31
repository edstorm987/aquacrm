import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type PortalRole = "admin" | "client";

export interface PortalSession {
  email: string;
  name: string;
  role: PortalRole;
  exp: number;
}

export const SESSION_COOKIE = "milesymedia_portal_session";
const LOCAL_SECRET = "local-milesymedia-portal-secret-change-before-production";

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function secret() {
  const configured = process.env.PORTAL_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (!isProduction()) return LOCAL_SECRET;
  throw new Error("PORTAL_SESSION_SECRET is required in production.");
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

function equal(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createPortalSession(input: Omit<PortalSession, "exp">) {
  const payload: PortalSession = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
  };
  const body = encode(payload);
  return `${body}.${sign(body)}`;
}

export function verifyPortalSession(token: string): PortalSession | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = sign(body);
  if (!equal(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PortalSession;
    if (!payload.email || !payload.name || !["admin", "client"].includes(payload.role)) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function authenticateLocalPortalUser(email: string, password: string): Omit<PortalSession, "exp"> | null {
  const adminEmail = process.env.PORTAL_ADMIN_EMAIL?.trim().toLowerCase()
    || (isProduction() ? "" : "edwardhallam07@gmail.com");
  const adminPassword = process.env.PORTAL_ADMIN_PASSWORD
    || (isProduction() ? "" : "SuperCreator123!");
  const clientEmail = process.env.PORTAL_CLIENT_EMAIL?.trim().toLowerCase()
    || (isProduction() ? "" : "client@milesymedia.local");
  const clientPassword = process.env.PORTAL_CLIENT_PASSWORD
    || (isProduction() ? "" : "Preview123!");
  const candidateEmail = email.trim().toLowerCase();

  if (adminEmail && adminPassword && equal(candidateEmail, adminEmail) && equal(password, adminPassword)) {
    return { email: adminEmail, name: "Ed", role: "admin" };
  }
  if (clientEmail && clientPassword && equal(candidateEmail, clientEmail) && equal(password, clientPassword)) {
    return { email: clientEmail, name: "Milesymedia client", role: "client" };
  }
  return null;
}

export async function authenticatePortalUser(email: string, password: string): Promise<Omit<PortalSession, "exp"> | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (!authError && authData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email,full_name,role")
          .eq("id", authData.user.id)
          .single();
        const role = profile?.role === "owner" || profile?.role === "staff" ? "admin" : "client";

        return {
          email: profile?.email || authData.user.email || email.trim().toLowerCase(),
          name: profile?.full_name || authData.user.user_metadata?.full_name || authData.user.email || "Client",
          role,
        };
      }
    } catch {
      if (isProduction()) return null;
    }
  }

  return authenticateLocalPortalUser(email, password);
}

export async function getPortalSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  return token ? verifyPortalSession(token) : null;
}
