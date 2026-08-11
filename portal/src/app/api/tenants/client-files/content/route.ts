import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import type { ClientFileRef } from "../route";

export const runtime = "nodejs";

interface FileCollectionAccess {
  downloadsEnabled?: unknown;
  watermarkEnabled?: unknown;
  watermarkLabel?: unknown;
}

function downloadHeaders(file: ClientFileRef, download = false): Headers {
  const headers = new Headers();
  headers.set("content-type", file.contentType || "application/octet-stream");
  headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  headers.set("cache-control", "private, max-age=60");
  headers.set("x-content-type-options", "nosniff");
  if (file.size) headers.set("content-length", String(file.size));
  return headers;
}

function collectionForFile(metadata: Record<string, unknown> | undefined, collectionId: string): FileCollectionAccess | undefined {
  const store = metadata?.portalProductWorkspaces;
  const workspaces = store && typeof store === "object" && !Array.isArray(store)
    ? Object.values(store as Record<string, unknown>)
    : [];
  return workspaces.flatMap(workspace => {
    if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) return [];
    const collections = (workspace as { collections?: unknown }).collections;
    return Array.isArray(collections) ? collections : [];
  }).find(item => item && typeof item === "object" && !Array.isArray(item) && (item as { id?: unknown }).id === collectionId) as FileCollectionAccess | undefined;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, character => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

async function watermarkedProof(bytes: Blob | ArrayBuffer | Uint8Array, label: string): Promise<Response> {
  const input = bytes instanceof Blob
    ? Buffer.from(await bytes.arrayBuffer())
    : bytes instanceof ArrayBuffer
      ? Buffer.from(bytes)
      : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const prepared = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: 2_400, height: 2_400, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#f4f1eb" })
    .webp({ quality: 88, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const width = prepared.info.width;
  const height = prepared.info.height;
  const safeLabel = escapeXml(label.trim().slice(0, 80) || "PRIVATE CLIENT PROOF");
  const fontSize = Math.max(22, Math.min(58, Math.round(width / 24)));
  const tileWidth = Math.max(300, Math.round(fontSize * 10));
  const tileHeight = Math.max(160, Math.round(fontSize * 4.5));
  const watermark = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="proof" width="${tileWidth}" height="${tileHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <text x="${Math.round(fontSize * 0.6)}" y="${Math.round(tileHeight * 0.58)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="2" fill="#ffffff" fill-opacity="0.48" stroke="#111111" stroke-opacity="0.22" stroke-width="2">${safeLabel}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#proof)" />
      <rect x="0" y="${Math.max(0, height - 54)}" width="100%" height="54" fill="#111111" fill-opacity="0.58" />
      <text x="24" y="${Math.max(34, height - 18)}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#ffffff">${safeLabel}</text>
    </svg>`);
  const output = await sharp(prepared.data)
    .composite([{ input: watermark, blend: "over" }])
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
  return new Response(output, {
    status: 200,
    headers: {
      "content-type": "image/webp",
      "content-disposition": "inline",
      "content-length": String(output.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(req: Request) {
  await ensureHydrated();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId")?.trim().slice(0, 120) ?? "";
  const fileId = url.searchParams.get("fileId")?.trim().slice(0, 120) ?? "";
  const download = url.searchParams.get("download") === "1";
  if (!clientId || !fileId) {
    return NextResponse.json({ ok: false, error: "clientId + fileId required" }, { status: 400 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  const files = Array.isArray(client.metadata?.files) ? client.metadata.files as ClientFileRef[] : [];
  const file = files.find(item => item.id === fileId);
  if (!file?.storageProvider || !file.storageKey) {
    return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }
  if (session.role === "end-customer" && file.customerVisible === false) {
    return NextResponse.json({ ok: false, error: "file not available" }, { status: 404 });
  }
  const collection = file.collectionId ? collectionForFile(client.metadata, file.collectionId) : undefined;
  if (session.role === "end-customer" && download && file.collectionId) {
    if (!collection || collection.downloadsEnabled !== true) {
      return NextResponse.json({ ok: false, error: "downloads are not enabled for this collection" }, { status: 403 });
    }
  }
  const shouldWatermark = session.role === "end-customer"
    && !download
    && (file.contentType ?? "").toLowerCase().startsWith("image/")
    && collection?.watermarkEnabled === true;
  const watermarkLabel = typeof collection?.watermarkLabel === "string" ? collection.watermarkLabel : "PRIVATE CLIENT PROOF";

  if (file.storageProvider === "supabase") {
    const stored = await readSupabasePrivateUpload(file.storageKey);
    if (!stored) return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    if (shouldWatermark) {
      try {
        return await watermarkedProof(stored, watermarkLabel);
      } catch {
        return NextResponse.json({ ok: false, error: "proof preview is unavailable for this image format" }, { status: 415 });
      }
    }
    return new Response(stored, { status: 200, headers: downloadHeaders(file, download) });
  }

  if (file.storageProvider === "vercel-blob") {
    const result = await get(file.storageKey, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    if (shouldWatermark) {
      try {
        return await watermarkedProof(await new Response(result.stream).arrayBuffer(), watermarkLabel);
      } catch {
        return NextResponse.json({ ok: false, error: "proof preview is unavailable for this image format" }, { status: 415 });
      }
    }
    return new Response(result.stream, { status: 200, headers: downloadHeaders(file, download) });
  }

  try {
    const uploadRoot = resolve(process.cwd(), ".data", "client-uploads");
    const targetPath = resolve(uploadRoot, file.storageKey);
    if (!targetPath.startsWith(`${uploadRoot}/`)) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    const bytes = await readFile(targetPath);
    if (shouldWatermark) {
      try {
        return await watermarkedProof(bytes, watermarkLabel);
      } catch {
        return NextResponse.json({ ok: false, error: "proof preview is unavailable for this image format" }, { status: 415 });
      }
    }
    return new Response(bytes, { status: 200, headers: downloadHeaders(file, download) });
  } catch {
    return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }
}
