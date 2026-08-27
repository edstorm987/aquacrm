import { NextResponse, type NextRequest } from "next/server";

import {
  getSessionFromRequest,
  sessionCookie,
} from "@/lib/server/auth/auth";
import {
  SandboxEnvironmentError,
  enterSandboxEnvironment,
  exitSandboxEnvironment,
  switchSandboxPersona,
} from "@/lib/server/sandbox/sandboxEnvironment";
import { ensureHydrated } from "@/server/storage";
import type {
  SandboxAccess,
  SandboxDataset,
  SandboxPersona,
} from "@/server/types";

type Action = "enter" | "configure" | "reset" | "persona" | "exit";

interface RequestBody {
  action?: Action;
  dataset?: SandboxDataset;
  access?: SandboxAccess;
  persona?: SandboxPersona;
}

const DATASETS = new Set<SandboxDataset>(["empty", "demo", "snapshot"]);
const ACCESS_LEVELS = new Set<SandboxAccess>(["read-only", "writable"]);
const PERSONAS = new Set<SandboxPersona>(["owner", "staff", "customer", "freelancer"]);

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const allowedOrigins = new Set([requestUrl.origin]);
  if (host) allowedOrigins.add(`${protocol}://${host}`);

  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function responseFor(result: Awaited<ReturnType<typeof enterSandboxEnvironment>>) {
  const cookie = sessionCookie(result.token);
  const response = NextResponse.json({
    ok: true,
    redirect: result.redirect,
    environment: result.environment,
  });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) {
      return NextResponse.json(
        { ok: false, error: "invalid_origin" },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    // Hydration follows the signed session's current realm. Environment
    // transitions explicitly cross back to live state only inside the server
    // service, never from a realm id supplied by the browser.
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    const body = await request.json().catch(() => null) as RequestBody | null;
    const action = body?.action;
    if (!action || !["enter", "configure", "reset", "persona", "exit"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Choose enter, configure, reset, persona, or exit." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    if (action === "exit") return responseFor(await exitSandboxEnvironment(session));

    if (action === "persona") {
      if (!body?.persona || !PERSONAS.has(body.persona)) {
        return NextResponse.json(
          { ok: false, error: "Choose owner, staff, customer, or freelancer." },
          { status: 400, headers: { "cache-control": "no-store" } },
        );
      }
      return responseFor(await switchSandboxPersona(session, body.persona));
    }

    const dataset = body?.dataset ?? session.sandbox?.dataset;
    const access = body?.access ?? session.sandbox?.access;
    if (!dataset || !DATASETS.has(dataset)) {
      return NextResponse.json(
        { ok: false, error: "Choose Empty, Demo, or Production snapshot data." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    if (!access || !ACCESS_LEVELS.has(access)) {
      return NextResponse.json(
        { ok: false, error: "Choose writable or read-only access." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    if (body?.persona && !PERSONAS.has(body.persona)) {
      return NextResponse.json(
        { ok: false, error: "Choose owner, staff, customer, or freelancer." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return responseFor(await enterSandboxEnvironment(session, {
      dataset,
      access,
      persona: body?.persona ?? session.sandbox?.persona,
      force: action === "reset",
    }));
  } catch (error) {
    if (error instanceof SandboxEnvironmentError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}
