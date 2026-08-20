import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isReservedSyntheticHostname, isUnsafeSyntheticAddress } from "@/engines/data/radar/radarSyntheticSafety";

/**
 * Fetch a public website's HTML, safely.
 *
 * This is the same SSRF-hardened fetch Radar's synthetic probes use, lifted out
 * so anything that needs to reach out to a site somebody typed in shares one
 * careful implementation instead of a second, subtly-different copy. Every hop
 * is re-checked, because a URL that resolved to a public address on the first
 * request can redirect to `169.254.169.254` on the second — following redirects
 * blindly is exactly how an SSRF gets from "fetch a domain" to "read the cloud
 * metadata endpoint".
 *
 * The address allow/deny decision itself lives in `radarSyntheticSafety` and is
 * shared with Radar, so the two can never drift on what counts as private.
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 512 * 1024;

export type SafeFetchFailureKind =
  | "invalid-url"
  | "unsafe-url"
  | "dns"
  | "timeout"
  | "redirect"
  | "network";

export class SafeFetchError extends Error {
  readonly kind: SafeFetchFailureKind;
  constructor(kind: SafeFetchFailureKind, message: string) {
    super(message);
    this.name = "SafeFetchError";
    this.kind = kind;
  }
}

export interface SafeSiteHtml {
  /** The URL actually read after following redirects. */
  finalUrl: string;
  statusCode: number;
  contentType?: string;
  /** The decoded response body, capped at `maxBytes`. */
  html: string;
  bytes: number;
  redirectCount: number;
  /** Every public address seen across the redirect chain, for the record. */
  dnsAddresses: string[];
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Overrides the polite default so a caller can identify itself. */
  userAgent?: string;
}

/**
 * Parse a user-supplied address into a URL we are willing to fetch.
 *
 * Accepts a bare domain (`cedar-dental.com`) by assuming https, the scheme most
 * sites redirect to anyway. Rejects everything that isn't plain http(s) and any
 * embedded credentials — a `user:pass@` URL is either a mistake or an attempt
 * to smuggle something past a naive host check.
 */
export function normalizeSiteUrl(value: string): URL {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new SafeFetchError("invalid-url", "Enter a website address to check.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new SafeFetchError("invalid-url", "That doesn't look like a website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("invalid-url", "Only http and https addresses can be checked.");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("invalid-url", "Remove the username and password from the address.");
  }
  url.hash = "";
  return url;
}

async function assertPublicDestination(url: URL): Promise<string[]> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || isReservedSyntheticHostname(hostname)) {
    throw new SafeFetchError("unsafe-url", `That address (${hostname || "no host"}) can't be reached from here.`);
  }
  if (isIP(hostname)) {
    if (isUnsafeSyntheticAddress(hostname)) {
      throw new SafeFetchError("unsafe-url", `That address (${hostname}) is a private or reserved one.`);
    }
    return [hostname];
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new SafeFetchError("dns", `We couldn't look up ${hostname}: ${message(error)}`);
  }
  if (!records.length) throw new SafeFetchError("dns", `${hostname} didn't resolve to any address.`);
  for (const record of records) {
    if (isUnsafeSyntheticAddress(record.address)) {
      throw new SafeFetchError("unsafe-url", `${hostname} resolves to a private or reserved address.`);
    }
  }
  return records.map(record => record.address);
}

async function fetchNoRedirect(url: URL, timeoutMs: number, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": userAgent,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SafeFetchError("timeout", `${url.hostname} took too long to respond.`);
    }
    throw new SafeFetchError("network", message(error));
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyPrefix(response: Response, limit: number): Promise<{ text: string; bytes: number }> {
  if (!response.body) return { text: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (bytes < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const retained = value.slice(0, Math.max(0, limit - bytes));
    chunks.push(retained);
    bytes += retained.byteLength;
    if (bytes >= limit) {
      await reader.cancel();
      break;
    }
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), bytes };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Fetch a public site's HTML, re-checking the destination on every redirect.
 *
 * Throws `SafeFetchError` for anything that stops us reaching a real public
 * page — an unparseable address, a private destination, DNS failure, a timeout,
 * a redirect loop, or a network error — with a `kind` the caller can turn into
 * a plain-English explanation.
 */
export async function fetchPublicSiteHtml(value: string, options: SafeFetchOptions = {}): Promise<SafeSiteHtml> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const userAgent = options.userAgent ?? "AquaCRM/1.0 (+aqua-tag-detector)";

  let current = normalizeSiteUrl(value);
  const dnsAddresses = new Set<string>();
  let redirectCount = 0;

  for (;;) {
    for (const address of await assertPublicDestination(current)) dnsAddresses.add(address);
    const response = await fetchNoRedirect(current, timeoutMs, userAgent);
    if (!isRedirect(response.status)) {
      const body = await readBodyPrefix(response, maxBytes).catch(() => ({ text: "", bytes: 0 }));
      return {
        finalUrl: current.toString(),
        statusCode: response.status,
        contentType: response.headers.get("content-type")?.toLowerCase() ?? undefined,
        html: body.text,
        bytes: body.bytes,
        redirectCount,
        dnsAddresses: [...dnsAddresses],
      };
    }
    const location = response.headers.get("location");
    if (!location) throw new SafeFetchError("redirect", "The site redirected without saying where to.");
    redirectCount += 1;
    if (redirectCount > MAX_REDIRECTS) throw new SafeFetchError("redirect", "The site redirected too many times.");
    try {
      current = new URL(location, current);
    } catch {
      throw new SafeFetchError("redirect", "The site redirected to an address we couldn't read.");
    }
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new SafeFetchError("unsafe-url", "The site redirected to a non-web address.");
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}
