import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSessionFromRequest } from "@/lib/server/auth";
import { isAgencyRole } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { deliverMagicLink, signMagicToken } from "@/lib/server/magicLink";
import { cleanPortalProducts } from "@/lib/portalProducts";

type PortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";

interface Body {
  clientId?: unknown;
  action?: unknown;
  mode?: unknown;
  loginEmail?: unknown;
  contactName?: unknown;
  servicePlan?: unknown;
  planSummary?: unknown;
  planIncludes?: unknown;
  billingCadence?: unknown;
  welcomeNote?: unknown;
  supportEmail?: unknown;
  supportPhone?: unknown;
  supportWhatsappUrl?: unknown;
  logoUrl?: unknown;
  accentColor?: unknown;
  billingUrl?: unknown;
  products?: unknown;
  experienceHeadline?: unknown;
}

function cleanMode(value: unknown): PortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance"
    ? value
    : "onboarding";
}

function cleanText(value: unknown, max = 600): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

function cleanSupportUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim().slice(0, 500);
  const candidate = /^(wa\.me|chat\.whatsapp\.com)\//i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function cleanHexColor(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : "";
}

function cleanPlanIncludes(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  return source
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 12);
}

function cleanBillingCadence(value: unknown): string {
  const allowed = [
    "Project",
    "Project + ongoing care",
    "One-off",
    "Monthly",
    "Quarterly",
    "Annually",
    "As agreed",
  ];
  return typeof value === "string" && allowed.includes(value) ? value : "As agreed";
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !isAgencyRole(session.role)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const clientId = cleanText(body.clientId, 120);
  const action = cleanText(body.action, 40);
  if (!["build-portal", "save", "send-access"].includes(action)) {
    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  }
  const agencyId = session.activeAgencyId ?? session.agencyId;
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  if (action !== "build-portal" && typeof client.metadata?.portalBuiltAt !== "number") {
    return NextResponse.json(
      { ok: false, error: "Create the client portal before saving it or sending access." },
      { status: 409 },
    );
  }

  const portalMode = cleanMode(body.mode);
  const portalLoginEmail = cleanEmail(body.loginEmail);
  const portalContactName = cleanText(body.contactName, 120);
  const portalServicePlan = cleanText(body.servicePlan, 160);
  const portalPlanSummary = cleanText(body.planSummary, 700);
  const portalPlanIncludes = cleanPlanIncludes(body.planIncludes);
  const portalBillingCadence = cleanBillingCadence(body.billingCadence);
  const portalWelcomeNote = cleanText(body.welcomeNote, 900);
  const portalSupportEmail = cleanEmail(body.supportEmail);
  const portalSupportPhone = cleanText(body.supportPhone, 60);
  const portalSupportWhatsappUrl = cleanSupportUrl(body.supportWhatsappUrl);
  const portalLogoUrl = cleanSupportUrl(body.logoUrl);
  const portalAccentColor = cleanHexColor(body.accentColor) || "#8b6c33";
  const portalProducts = cleanPortalProducts(body.products);
  const portalExperienceHeadline = cleanText(body.experienceHeadline, 160);
  const stripeLink = cleanSupportUrl(body.billingUrl);
  if (typeof body.billingUrl === "string" && body.billingUrl.trim() && !stripeLink) {
    return NextResponse.json({ ok: false, error: "payment link must use http or https" }, { status: 400 });
  }
  const portalBuiltAt = action === "build-portal"
    ? Date.now()
    : typeof client.metadata?.portalBuiltAt === "number"
      ? client.metadata.portalBuiltAt
      : undefined;

  const saved = updateClient(agencyId, client.id, {
    endCustomers: { signupsEnabled: true, postLoginReturnUrl: "/portal/customer" },
    metadata: {
      portalMode,
      portalLoginEmail,
      portalContactName,
      portalServicePlan,
      portalPlanSummary,
      portalPlanIncludes,
      portalBillingCadence,
      portalWelcomeNote,
      portalSupportEmail,
      portalSupportPhone,
      portalSupportWhatsappUrl,
      portalLogoUrl,
      portalAccentColor,
      portalProducts,
      portalExperienceHeadline,
      stripeLink,
      portalBuiltAt,
      portalRequired: action === "build-portal"
        ? true
        : client.metadata?.portalRequired,
      portalShellVersion: action === "build-portal"
        ? "milesymedia-customer-home-v2"
        : client.metadata?.portalShellVersion,
      portalProvisioningSource: action === "build-portal"
        ? "built-in"
        : client.metadata?.portalProvisioningSource,
      portalAccessUpdatedAt: Date.now(),
    },
  });
  if (!saved) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });

  if (action !== "send-access") {
    logActivity({
      agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "fulfillment",
      action: action === "build-portal" ? "customer_portal.built" : "customer_portal.updated",
      message: action === "build-portal"
        ? `Built customer portal shell for ${client.name}.`
        : `Updated customer portal preview for ${client.name}.`,
      metadata: { portalMode, portalLoginEmail },
    });
    return NextResponse.json({ ok: true, client: { id: saved.id, metadata: saved.metadata } });
  }

  if (!portalLoginEmail) {
    return NextResponse.json({ ok: false, error: "customer email is required before sending access" }, { status: 400 });
  }

  const { token } = signMagicToken({ email: portalLoginEmail, clientId: client.id, agencyId });
  const magicUrl = new URL("/login/magic", req.nextUrl.origin);
  magicUrl.searchParams.set("token", token);
  magicUrl.searchParams.set("return", "/portal/customer");

  const result = await deliverMagicLink({
    email: portalLoginEmail,
    clientId: client.id,
    agencyId,
    magicUrl: magicUrl.toString(),
  });

  const accessAt = Date.now();
  if (result.delivered) {
    updateClient(agencyId, client.id, {
      metadata: { portalAccessSentAt: accessAt },
    });
  } else if (process.env.NODE_ENV !== "production") {
    updateClient(agencyId, client.id, {
      metadata: { portalAccessPreparedAt: accessAt },
    });
  }

  logActivity({
    agencyId,
    clientId: client.id,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "fulfillment",
    action: result.delivered
      ? "customer_access.sent"
      : process.env.NODE_ENV === "production"
        ? "customer_access.failed"
        : "customer_access.prepared",
    message: result.delivered
      ? `Sent customer portal access to ${portalLoginEmail}.`
      : process.env.NODE_ENV === "production"
        ? `Could not deliver customer portal access to ${portalLoginEmail}.`
        : `Prepared local customer portal access for ${portalLoginEmail}.`,
    metadata: { portalMode, portalLoginEmail, delivery: result.via },
  });

  if (!result.delivered && process.env.NODE_ENV === "production") {
    return NextResponse.json({
      ok: false,
      error: "Customer access could not be delivered. Check the transactional email settings and try again.",
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sent: result.delivered,
    via: result.via,
    username: portalLoginEmail,
    ...(process.env.NODE_ENV !== "production" && !result.delivered ? { devAccessUrl: magicUrl.toString() } : {}),
  });
}
