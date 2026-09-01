import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { Block } from "../../types/block";
import { listBlogPosts } from "../../server/blog";
import { getPage } from "../../server/pages";
import { getSite } from "../../server/sites";
import {
  normaliseVisitorContactConsentStatement,
  visitorContactConsentDigest,
} from "../../lib/visitorContactConsent";
import {
  takeVisitorRateLimitsLocked,
  visitorBoundaryDigest,
  withVisitorPublicBoundary,
} from "../../server/visitorPublicBoundary";
import { clientIpFromHeaders } from "@/lib/server/rateLimit";
import { fail, json, ok, requireClientScope } from "../helpers";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\d\s.-]{7,40}$/;
const CONTACT_OPERATION_PREFIX = "visitor-contact-operation:v1:";

interface VisitorContactInput {
  version: 1;
  operationId: string;
  siteId: string;
  pageId: string;
  blockId: string;
  contact: {
    name: string;
    email?: string;
    phone?: string;
    message: string;
  };
  consent: {
    agreed: true;
    purpose: "contact-request";
    version: number;
    statementDigest: string;
  };
}

export interface VisitorContactSubmission {
  id: string;
  agencyId: string;
  clientId: string;
  siteId: string;
  pageId: string;
  blockId: string;
  formName: string;
  contact: VisitorContactInput["contact"];
  consent: VisitorContactInput["consent"] & { statement: string; capturedAt: number };
  sourcePath: string;
  createdAt: number;
}

interface VisitorContactOperation {
  fingerprint: string;
  receiptId: string;
  /** The canonical contact record. PII is stored here once, not in a sidecar. */
  submission: VisitorContactSubmission;
}

interface PublicBlogPostSummary {
  slug: string;
  title: string;
  excerpt?: string;
  coverImg?: string;
  tags: string[];
  author?: string;
  publishedAt?: number;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allow = new Set(allowed);
  return Object.keys(value).every(key => allow.has(key));
}

function parseContactInput(value: unknown): VisitorContactInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!exactKeys(body, ["version", "operationId", "siteId", "pageId", "blockId", "contact", "consent", "website"])) return null;
  if (body.version !== 1) return null;

  const operationId = clean(body.operationId, 120);
  const siteId = clean(body.siteId, 120);
  const pageId = clean(body.pageId, 120);
  const blockId = clean(body.blockId, 120);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(operationId) || !siteId || !pageId || !blockId) return null;

  if (!body.contact || typeof body.contact !== "object" || Array.isArray(body.contact)) return null;
  const rawContact = body.contact as Record<string, unknown>;
  if (!exactKeys(rawContact, ["name", "email", "phone", "message"])) return null;
  const name = clean(rawContact.name, 120);
  const email = clean(rawContact.email, 254).toLowerCase();
  const phone = clean(rawContact.phone, 40);
  const message = clean(rawContact.message, 4_000);
  if (!name || !message || (!EMAIL.test(email) && !PHONE.test(phone))) return null;

  if (!body.consent || typeof body.consent !== "object" || Array.isArray(body.consent)) return null;
  const rawConsent = body.consent as Record<string, unknown>;
  if (!exactKeys(rawConsent, ["agreed", "purpose", "version", "statementDigest"])) return null;
  const consentVersion = Number(rawConsent.version);
  const statementDigest = clean(rawConsent.statementDigest, 71).toLowerCase();
  if (
    rawConsent.agreed !== true
    || rawConsent.purpose !== "contact-request"
    || !Number.isSafeInteger(consentVersion)
    || consentVersion < 1
    || consentVersion > 10_000
    || !/^sha256:[a-f0-9]{64}$/.test(statementDigest)
  ) return null;

  return {
    version: 1,
    operationId,
    siteId,
    pageId,
    blockId,
    contact: {
      name,
      ...(EMAIL.test(email) ? { email } : {}),
      ...(PHONE.test(phone) ? { phone } : {}),
      message,
    },
    consent: {
      agreed: true,
      purpose: "contact-request",
      version: consentVersion,
      statementDigest,
    },
  };
}

function findBlock(blocks: readonly Block[] | undefined, blockId: string): Block | null {
  for (const block of blocks ?? []) {
    if (block.id === blockId) return block;
    const child = findBlock(block.children, blockId);
    if (child) return child;
  }
  return null;
}

function normalisedHost(value: string): string {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try { return new URL(candidate).host.toLowerCase(); }
  catch { return ""; }
}

function originAllowed(req: Request, site: { customDomain?: string; domains?: string[]; primaryDomain?: string }): boolean {
  const raw = req.headers.get("origin");
  if (!raw) return false;
  let origin: URL;
  try { origin = new URL(raw); }
  catch { return false; }
  if (origin.origin === new URL(req.url).origin) return true;
  if (
    process.env.NODE_ENV !== "production"
    && (origin.hostname === "localhost" || origin.hostname === "127.0.0.1")
  ) return true;
  const registered = [site.primaryDomain, site.customDomain, ...(site.domains ?? [])]
    .filter((value): value is string => Boolean(value))
    .map(normalisedHost);
  return registered.includes(origin.host.toLowerCase());
}

function sourcePath(req: Request): string {
  const referer = req.headers.get("referer");
  const origin = req.headers.get("origin");
  if (!referer || !origin) return "/";
  try {
    const url = new URL(referer);
    return url.origin === new URL(origin).origin ? url.pathname.slice(0, 300) || "/" : "/";
  } catch { return "/"; }
}

function contactFingerprint(input: VisitorContactInput): Promise<string> {
  return visitorBoundaryDigest(JSON.stringify({
    version: input.version,
    siteId: input.siteId,
    pageId: input.pageId,
    blockId: input.blockId,
    contact: input.contact,
    consent: input.consent,
  }));
}

function newReceiptId(): string {
  return `contact_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function privateFailure(area: string, error: unknown): Response {
  console.error(`[website-editor-public] ${area} failed:`, error instanceof Error ? error.message : error);
  return json(
    { ok: false, error: "This service is temporarily unavailable. Please try again." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

/** Anonymous contact capture. No free-shape payload or operator data crosses this facade. */
export async function handleVisitorContact(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return fail("Please check the form and try again.", 400); }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && clean((raw as Record<string, unknown>).website, 200)) {
    return json({ ok: true, receiptId: "accepted" }, { status: 200, headers: { "cache-control": "no-store" } });
  }
  const input = parseContactInput(raw);
  if (!input) return fail("Please provide valid contact details and consent.", 400);

  try {
    return await withVisitorPublicBoundary(ctx.storage, async () => {
      const operationKey = `${CONTACT_OPERATION_PREFIX}${encodeURIComponent(input.operationId)}`;
      const fingerprint = await contactFingerprint(input);
      const existing = await ctx.storage.get<VisitorContactOperation>(operationKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return fail("This submission reference was already used.", 409);
        return json(
          { ok: true, receiptId: existing.receiptId },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      }

      // The site/page/block checks live inside the same durable transaction as
      // the write. A concurrent unpublish cannot pass an earlier check and
      // then accept a submission against content that is no longer public.
      const site = await getSite(ctx.storage, scope.agencyId, scope.clientId, input.siteId);
      if (!site || (site.status !== "active" && site.status !== "live")) return fail("Contact form not found.", 404);
      if (!originAllowed(req, site)) return fail("This contact form could not be verified.", 403);
      const page = await getPage(ctx.storage, scope.agencyId, scope.clientId, input.siteId, input.pageId);
      if (!page || page.status !== "published" || (page.privacy && page.privacy !== "public" && page.privacy !== "unlisted")) {
        return fail("Contact form not found.", 404);
      }
      const block = findBlock(page.publishedBlocks ?? page.blocks, input.blockId);
      if (!block || block.type !== "contact-form") return fail("Contact form not found.", 404);
      const configuredConsentVersion = Number.isSafeInteger(block.props.consentVersion)
        ? Number(block.props.consentVersion)
        : 1;
      if (input.consent.version !== configuredConsentVersion) {
        return fail("The consent wording changed. Please review it and submit again.", 400);
      }
      const consentStatement = normaliseVisitorContactConsentStatement(block.props.consentLabel);
      const consentStatementDigest = await visitorContactConsentDigest(consentStatement);
      if (input.consent.statementDigest !== consentStatementDigest) {
        return fail("The consent wording changed. Please review it and submit again.", 400);
      }

      const ip = clientIpFromHeaders(req.headers);
      const limit = await takeVisitorRateLimitsLocked(ctx.storage, [
        { action: "contact-ip", identity: ip, max: 8, windowMs: 60 * 60 * 1_000 },
        { action: "contact-install", identity: "all", max: 120, windowMs: 60 * 60 * 1_000 },
      ]);
      if (!limit.allowed) {
        return json(
          { ok: false, error: "Too many messages have been sent. Please try again later." },
          {
            status: 429,
            headers: { "retry-after": String(limit.retryAfterSec), "cache-control": "no-store" },
          },
        );
      }

      const now = Date.now();
      const receiptId = newReceiptId();
      const submission: VisitorContactSubmission = {
        id: receiptId,
        agencyId: scope.agencyId,
        clientId: scope.clientId,
        siteId: input.siteId,
        pageId: input.pageId,
        blockId: input.blockId,
        formName: clean(block.props.formName, 160) || "contact",
        contact: input.contact,
        consent: { ...input.consent, statement: consentStatement, capturedAt: now },
        sourcePath: sourcePath(req),
        createdAt: now,
      };
      // One durable value is both the replay receipt and the operator-visible
      // submission. A process cannot crash between two writes and leave an
      // orphan submission that a retry would duplicate; contact PII also has
      // exactly one stored copy.
      await ctx.storage.set(operationKey, {
        fingerprint,
        receiptId,
        submission,
      } satisfies VisitorContactOperation);
      return json(
        { ok: true, receiptId },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    });
  } catch (error) {
    return privateFailure("contact capture", error);
  }
}

/** Authenticated operator read; deliberately not registered as a public route. */
export async function handleListVisitorContacts(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const requested = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const limit = Number.isSafeInteger(requested) ? Math.max(1, Math.min(100, requested)) : 50;
  const keys = await ctx.storage.list(CONTACT_OPERATION_PREFIX);
  const rows = await Promise.all(keys.map(key => ctx.storage.get<VisitorContactOperation>(key)));
  const submissions = rows
    .map(row => row?.submission)
    .filter((submission): submission is VisitorContactSubmission => Boolean(
      submission && submission.agencyId === scope.agencyId && submission.clientId === scope.clientId,
    ))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return ok({ submissions }, { headers: { "cache-control": "no-store" } });
}

function toPublicBlogPostSummary(post: {
  slug: string; title: string; excerpt?: string; coverImg?: string;
  tags: string[]; author?: string; publishedAt?: number;
}): PublicBlogPostSummary {
  return {
    slug: post.slug,
    title: post.title,
    ...(post.excerpt ? { excerpt: post.excerpt } : {}),
    ...(post.coverImg ? { coverImg: post.coverImg } : {}),
    tags: [...post.tags],
    ...(post.author ? { author: post.author } : {}),
    ...(post.publishedAt ? { publishedAt: post.publishedAt } : {}),
  };
}

/** Published summary feed only; draft state and post bodies stay behind operator routes. */
export async function handleVisitorBlogPosts(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const url = new URL(req.url);
  const siteId = clean(url.searchParams.get("siteId"), 120);
  if (!siteId) return fail("siteId required", 400);

  try {
    return await withVisitorPublicBoundary(ctx.storage, async () => {
      const site = await getSite(ctx.storage, scope.agencyId, scope.clientId, siteId);
      if (!site || (site.status !== "active" && site.status !== "live")) return fail("site not found", 404);

      const limited = await takeVisitorRateLimitsLocked(ctx.storage, [
        {
          action: "blog",
          identity: clientIpFromHeaders(req.headers),
          max: 120,
          windowMs: 60_000,
        },
        {
          action: "blog-install",
          identity: "all",
          max: 1_200,
          windowMs: 60_000,
        },
      ]);
      if (!limited.allowed) {
        return json(
          { ok: false, error: "Too many requests. Please try again shortly." },
          { status: 429, headers: { "retry-after": String(limited.retryAfterSec), "cache-control": "no-store" } },
        );
      }
      const requestedLimit = Number(url.searchParams.get("limit") ?? 6);
      const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(24, requestedLimit)) : 6;
      const tag = clean(url.searchParams.get("tag"), 80);
      const posts = await listBlogPosts(ctx.storage, scope.agencyId, scope.clientId, siteId, {
        status: "published",
        limit,
        ...(tag ? { tag } : {}),
      });
      return json(
        { ok: true, posts: posts.map(toPublicBlogPostSummary) },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    });
  } catch (error) {
    return privateFailure("blog summaries", error);
  }
}
