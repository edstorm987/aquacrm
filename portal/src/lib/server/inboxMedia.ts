import "server-only";

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";

import type { InboxOutboundAttachmentKind } from "@/lib/inbox/media";
import { readSupabasePrivateUpload, type PrivateUploadStorageProvider } from "@/lib/server/privateUploadStorage";

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

export async function readInboxMedia(payload: InboxMediaTokenPayload): Promise<Blob | Buffer | null> {
  if (payload.storageProvider === "supabase") {
    if (!payload.storageKey.startsWith(`inbox-media/${payload.agencyId}/`)) return null;
    return readSupabasePrivateUpload(payload.storageKey);
  }
  if (payload.storageProvider === "vercel-blob") {
    let pathname = "";
    try { pathname = new URL(payload.storageKey).pathname; } catch { return null; }
    if (!pathname.includes(`/inbox-media/${payload.agencyId}/`)) return null;
    const stored = await get(payload.storageKey, { access: "private" });
    if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
    return new Response(stored.stream).blob();
  }
  if (payload.storageProvider !== "local") return null;
  const root = resolve(process.cwd(), ".data", "inbox-media", payload.agencyId);
  const target = resolve(process.cwd(), ".data", "inbox-media", payload.storageKey);
  if (!target.startsWith(`${root}/`)) return null;
  try { return await readFile(target); } catch { return null; }
}

export function inboxMediaUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/api/portal/inbox/media/content?token=${encodeURIComponent(token)}`;
}
