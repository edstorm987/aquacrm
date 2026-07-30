import { extname, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import type { ClientProperty } from "@/app/api/tenants/client-properties/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

interface Context {
  params: Promise<{
    clientId: string;
    propertyId: string;
    assetPath?: string[];
  }>;
}

export async function GET(request: Request, context: Context) {
  try {
    await ensureHydrated();
    const { clientId, propertyId, assetPath } = await context.params;
    const requestUrl = new URL(request.url);
    const session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return new NextResponse("Client not found.", { status: 404 });

    const metadata = (client.metadata ?? {}) as { properties?: ClientProperty[] };
    const property = metadata.properties?.find(item => item.id === propertyId);
    if (!property?.localPath) return new NextResponse("Project workspace not found.", { status: 404 });

    const projectRoot = resolve(property.localPath);
    const relativeAsset = assetPath?.length ? assetPath.join("/") : "index.html";
    const requestedPath = resolve(projectRoot, relativeAsset);
    if (requestedPath !== projectRoot && !requestedPath.startsWith(`${projectRoot}${sep}`)) {
      return new NextResponse("Invalid project path.", { status: 400 });
    }

    const file = await readFile(requestedPath).catch(() => null);
    if (!file) return new NextResponse("Preview file not found.", { status: 404 });
    const extension = extname(requestedPath).toLowerCase();
    const body = extension === ".html"
      ? file.toString("utf8").replace(
        "<head>",
        `<head><base href="${requestUrl.pathname.replace(/\/+$/, "")}/">`,
      )
      : file;

    return new NextResponse(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
