import path from "node:path";
import { NextResponse } from "next/server";

const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function noStoreHeaders(headers = new Headers()) {
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noStoreHeaders() },
  );
}

export function jsonOk<T extends Record<string, unknown>>(body: T, status = 200) {
  return NextResponse.json(
    { ok: true, ...body },
    { status, headers: noStoreHeaders() },
  );
}

export function cleanString(value: unknown, maxLength: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function safeInternalPath(value: string, fallback: string) {
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://internal.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function allowedPublicOrigins(request: Request) {
  const values = [
    process.env.NEXT_PUBLIC_AQUA_CRM_URL,
    process.env.NEXT_PUBLIC_AQUAOASIS_URL,
    process.env.NEXT_PUBLIC_ZIMANTE_URL,
    process.env.NEXT_PUBLIC_MILESYMEDIA_URL,
    process.env.NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL,
  ];
  const origins = new Set<string>([new URL(request.url).origin]);
  for (const value of values) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed local env values.
    }
  }
  return origins;
}

export function safeRedirectUrl(value: string, request: Request, fallback: string) {
  const fallbackUrl = new URL(fallback, request.url);
  if (!value) return fallbackUrl;
  if (value.startsWith("/") && !value.startsWith("//")) return new URL(value, request.url);
  try {
    const parsed = new URL(value);
    const isAllowed = allowedPublicOrigins(request).has(parsed.origin)
      || (process.env.NODE_ENV !== "production" && localhostPattern.test(parsed.origin));
    return isAllowed ? parsed : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

export function safePublicFilePath(src: string) {
  const publicRoot = path.resolve(process.cwd(), "public");
  const cleanSrc = src.replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, cleanSrc);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("Invalid file path.");
  }
  return filePath;
}

export function safeZipName(name: string, fallback: string) {
  const clean = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || fallback;
}
