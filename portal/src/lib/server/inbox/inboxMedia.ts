import "server-only";

import crypto from "node:crypto";
import { resolve } from "node:path";

import type { InboxOutboundAttachmentKind } from "@/lib/inbox/media";
import { readLocalFileRange, readVercelBlobRange, type ByteRange } from "@/lib/server/privateMediaResponse";
import { readSupabasePrivateUploadRange, type PrivateUploadStorageProvider } from "@/lib/server/privateUploadStorage";

export type InboxMediaTargetKind = "website" | "social" | "client";

export interface InboxMediaTokenPayload {
  agencyId: string;
  targetKind: InboxMediaTargetKind;
  targetId: string;
  id: string;
  name: string;
  size: number;
  contentType: string;
  kind: InboxOutboundAttachmentKind;
  storageProvider: PrivateUploadStorageProvider;
  storageKey: string;
  exp: number;
}

function secret(): string {
  return process.env.PORTAL_SESSION_SECRET?.trim() || "dev-secret-do-not-use-in-prod";
}

export function signInboxMediaToken(input: Omit<InboxMediaTokenPayload, "exp">, lifetimeMs = 30 * 24 * 60 * 60_000): string {
  const payload: InboxMediaTokenPayload = { ...input, exp: Date.now() + lifetimeMs };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyInboxMediaToken(token: string): InboxMediaTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InboxMediaTokenPayload;
    if (!payload || payload.exp < Date.now() || !payload.agencyId || !payload.targetId || !payload.storageKey) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Reads an attachment, honouring a byte range when one is asked for. Every
 * provider streams: the whole object is never buffered just to hand back the
 * few bytes a mounted player asked for. `range` is `null` for a full read.
 */
export async function readInboxMedia(
  payload: InboxMediaTokenPayload,
  range: ByteRange | null = null,
): Promise<BodyInit | null> {
  if (payload.storageProvider === "supabase") {
    if (!payload.storageKey.startsWith(`inbox-media/${payload.agencyId}/`)) return null;
    return readSupabasePrivateUploadRange(payload.storageKey, range);
  }
  if (payload.storageProvider === "vercel-blob") {
    let pathname = "";
    try { pathname = new URL(payload.storageKey).pathname; } catch { return null; }
    if (!pathname.includes(`/inbox-media/${payload.agencyId}/`)) return null;
    return readVercelBlobRange(payload.storageKey, range);
  }
  if (payload.storageProvider !== "local") return null;
  const root = resolve(process.cwd(), ".data", "inbox-media", payload.agencyId);
  const target = resolve(process.cwd(), ".data", "inbox-media", payload.storageKey);
  if (!target.startsWith(`${root}/`)) return null;
  return readLocalFileRange(target, range);
}

/** Full attachment bytes, for callers that must attach the object itself. */
export async function readInboxMediaBytes(payload: InboxMediaTokenPayload): Promise<Buffer | null> {
  const stored = await readInboxMedia(payload, null);
  if (stored === null) return null;
  return Buffer.from(await new Response(stored).arrayBuffer());
}

export function inboxMediaUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/api/portal/inbox/media/content?token=${encodeURIComponent(token)}`;
}
