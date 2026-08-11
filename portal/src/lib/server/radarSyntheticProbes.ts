import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { connect as connectTls } from "node:tls";

import { isReservedSyntheticHostname, isUnsafeSyntheticAddress } from "@/lib/radarSyntheticSafety";
import { getState, mutate } from "@/server/storage";
import type { Client, RadarSyntheticProbeResult } from "@/server/types";

const PROBE_CADENCE_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const HARD_TARGET_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 128 * 1024;
const MAX_CONCURRENCY = 4;

interface StoredProperty {
  id?: string;
  label?: string;
  kind?: string;
  status?: string;
  liveUrl?: string;
}

export interface RadarSyntheticTarget {
  propertyId: string;
  label: string;
  url: string;
}

export async function runAgencySyntheticProbes(
  agencyId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<RadarSyntheticProbeResult[]> {
  const now = options.now ?? Date.now();
  const targets = discoverRadarSyntheticTargets(agencyId);
  const previous = getState().radarSyntheticProbes[agencyId] ?? {};
  const next: Record<string, RadarSyntheticProbeResult> = {};
  const queued: RadarSyntheticTarget[] = [];

  for (const target of targets) {
    const retained = previous[target.propertyId];
    if (!options.force && retained && now - retained.checkedAt < PROBE_CADENCE_MS) next[target.propertyId] = retained;
    else queued.push(target);
  }

  await runWithConcurrency(queued, MAX_CONCURRENCY, async target => {
    next[target.propertyId] = await probeWithHardDeadline(agencyId, target, now);
  });

  mutate(state => {
    state.radarSyntheticProbes[agencyId] = next;
  });
  return Object.values(next);
}

async function probeWithHardDeadline(agencyId: string, target: RadarSyntheticTarget, checkedAt: number): Promise<RadarSyntheticProbeResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<RadarSyntheticProbeResult>(resolve => {
    timer = setTimeout(() => {
      const base = baseResult(agencyId, target, checkedAt);
      resolve({ ...base, durationMs: HARD_TARGET_TIMEOUT_MS, failureKind: "timeout", error: `Synthetic probe exceeded its ${HARD_TARGET_TIMEOUT_MS / 1_000}-second end-to-end deadline.` });
    }, HARD_TARGET_TIMEOUT_MS);
    timer.unref?.();
  });
  const result = await Promise.race([probeRadarTarget(agencyId, target, checkedAt), timeoutResult]);
  if (timer) clearTimeout(timer);
  return result;
}

export function listAgencySyntheticProbes(agencyId: string): RadarSyntheticProbeResult[] {
  return Object.values(getState().radarSyntheticProbes[agencyId] ?? {});
}

export function discoverRadarSyntheticTargets(agencyId: string): RadarSyntheticTarget[] {
  const state = getState();
  const targets: RadarSyntheticTarget[] = [];
  const website = state.agencyWebsites[agencyId];
  if (website && clean(website.productionUrl)) {
    targets.push({ propertyId: "agency-website", label: website.name, url: clean(website.productionUrl) });
  }

  const clients = Object.values(state.clients).filter(client => client.agencyId === agencyId && client.status === "active");
  for (const client of clients) targets.push(...clientTargets(client));
  return [...new Map(targets.map(target => [target.propertyId, target])).values()];
}

async function probeRadarTarget(
  agencyId: string,
  target: RadarSyntheticTarget,
  checkedAt: number,
): Promise<RadarSyntheticProbeResult> {
  const startedAt = Date.now();
  const base = baseResult(agencyId, target, checkedAt);
  let current: URL;
  try {
    current = normalizeTargetUrl(target.url);
  } catch (error) {
    return failed(base, startedAt, "invalid-url", message(error));
  }

  const dnsAddresses = new Set<string>();
  let response: Response | undefined;
  let redirectCount = 0;
  try {
    for (;;) {
      const addresses = await assertPublicDestination(current);
      for (const address of addresses) dnsAddresses.add(address);
      response = await fetchWithTimeout(current, REQUEST_TIMEOUT_MS);
      if (!isRedirect(response.status)) break;
      const location = response.headers.get("location");
      if (!location) return failed({ ...base, dnsAddresses: [...dnsAddresses], statusCode: response.status }, startedAt, "redirect", "Redirect response did not include a destination.");
      redirectCount += 1;
      if (redirectCount > MAX_REDIRECTS) return failed({ ...base, dnsAddresses: [...dnsAddresses], statusCode: response.status, redirectCount }, startedAt, "redirect", `More than ${MAX_REDIRECTS} redirects were returned.`);
      current = new URL(location, current);
    }
  } catch (error) {
    const kind = probeFailureKind(error);
    return failed({ ...base, dnsAddresses: [...dnsAddresses], redirectCount, finalUrl: current.toString() }, startedAt, kind, message(error));
  }

  const body = await readBodyPrefix(response, MAX_HTML_BYTES).catch(() => ({ text: "", bytes: 0 }));
  const contentType = response.headers.get("content-type")?.toLowerCase();
  const html = body.text;
  const finalUrl = current.toString();
  const securityHeaders = inspectSecurityHeaders(response.headers);
  const tls = current.protocol === "https:" ? await inspectTls(current) : {};
  const statusOk = response.status >= 200 && response.status < 400;
  const htmlOk = Boolean(contentType?.includes("text/html")) && body.bytes > 0;
  const tlsOk = current.protocol !== "https:" || tls.tlsValid === true;

  return {
    ...base,
    durationMs: Math.max(0, Date.now() - startedAt),
    ok: statusOk && htmlOk && tlsOk,
    statusCode: response.status,
    failureKind: statusOk ? htmlOk ? tlsOk ? undefined : "tls" : "http" : "http",
    error: statusOk ? htmlOk ? tlsOk ? undefined : "TLS certificate validation failed." : "Response was not a readable HTML document." : `HTTP ${response.status}`,
    finalUrl,
    redirectCount,
    dnsAddresses: [...dnsAddresses],
    contentType,
    htmlBytes: body.bytes,
    titleDetected: /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i.test(html),
    formsDetected: (html.match(/<form(?:\s|>)/gi) ?? []).length,
    tagDetected: /(?:aqua|milesy)[-_]?(?:tag|telemetry)|telemetrySiteKey|data-(?:aqua|milesy)-site/i.test(html),
    ...tls,
    securityHeaders,
  };
}

function clientTargets(client: Client): RadarSyntheticTarget[] {
  const metadata = client.metadata ?? {};
  const stored = Array.isArray(metadata.properties) ? metadata.properties as StoredProperty[] : [];
  if (!stored.length) {
    return clean(client.websiteUrl)
      ? [{ propertyId: `${client.id}:client-${client.id}`, label: client.name, url: clean(client.websiteUrl) }]
      : [];
  }
  return stored.flatMap((property, index) => {
    const liveUrl = clean(property.liveUrl);
    const expectedLive = ["live", "active", "production", "published"].includes(clean(property.status).toLowerCase()) || Boolean(liveUrl);
    if (!expectedLive || !liveUrl) return [];
    const propertyId = clean(property.id) || `client-${client.id}-${index + 1}`;
    return [{
      propertyId: `${client.id}:${propertyId}`,
      label: clean(property.label) || `${client.name} ${clean(property.kind) || "property"}`,
      url: liveUrl,
    }];
  });
}

function normalizeTargetUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS targets can be monitored.");
  if (url.username || url.password) throw new Error("Synthetic targets cannot contain credentials.");
  url.hash = "";
  return url;
}

async function assertPublicDestination(url: URL): Promise<string[]> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || isReservedSyntheticHostname(hostname)) throw unsafeDestination(hostname || "missing hostname");
  if (isIP(hostname)) {
    if (isUnsafeSyntheticAddress(hostname)) throw unsafeDestination(hostname);
    return [hostname];
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    const wrapped = new Error(`DNS lookup failed for ${hostname}: ${message(error)}`);
    wrapped.name = "RadarDnsError";
    throw wrapped;
  }
  if (!records.length) {
    const error = new Error(`DNS returned no addresses for ${hostname}.`);
    error.name = "RadarDnsError";
    throw error;
  }
  for (const record of records) if (isUnsafeSyntheticAddress(record.address)) throw unsafeDestination(record.address);
  return records.map(record => record.address);
}

function unsafeDestination(destination: string): Error {
  const error = new Error(`Synthetic monitoring blocked a private or reserved destination (${destination}).`);
  error.name = "RadarUnsafeUrlError";
  return error;
}

async function fetchWithTimeout(url: URL, timeoutMs: number): Promise<Response> {
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
        "user-agent": "AquaCRM-Radar/1.0 (+synthetic-availability-monitor)",
      },
    });
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

function inspectSecurityHeaders(headers: Headers): RadarSyntheticProbeResult["securityHeaders"] {
  const csp = headers.get("content-security-policy") ?? "";
  return {
    strictTransportSecurity: headers.has("strict-transport-security"),
    contentSecurityPolicy: Boolean(csp),
    frameProtection: headers.has("x-frame-options") || /frame-ancestors/i.test(csp),
    contentTypeOptions: /nosniff/i.test(headers.get("x-content-type-options") ?? ""),
    referrerPolicy: headers.has("referrer-policy"),
    permissionsPolicy: headers.has("permissions-policy"),
  };
}

function inspectTls(url: URL): Promise<Pick<RadarSyntheticProbeResult, "tlsValid" | "tlsExpiresAt" | "tlsDaysRemaining">> {
  return new Promise(resolve => {
    const socket = connectTls({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: true,
      timeout: REQUEST_TIMEOUT_MS,
    });
    let settled = false;
    const finish = (value: Pick<RadarSyntheticProbeResult, "tlsValid" | "tlsExpiresAt" | "tlsDaysRemaining">) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const tlsExpiresAt = certificate.valid_to ? Date.parse(certificate.valid_to) : undefined;
      finish({
        tlsValid: socket.authorized && Boolean(tlsExpiresAt && tlsExpiresAt > Date.now()),
        tlsExpiresAt: Number.isFinite(tlsExpiresAt) ? tlsExpiresAt : undefined,
        tlsDaysRemaining: Number.isFinite(tlsExpiresAt) ? Math.floor((tlsExpiresAt! - Date.now()) / 86_400_000) : undefined,
      });
    });
    socket.once("timeout", () => finish({ tlsValid: false }));
    socket.once("error", () => finish({ tlsValid: false }));
  });
}

function baseResult(agencyId: string, target: RadarSyntheticTarget, checkedAt: number): RadarSyntheticProbeResult {
  return {
    id: `synthetic:${target.propertyId}`,
    agencyId,
    propertyId: target.propertyId,
    label: target.label,
    url: target.url,
    checkedAt,
    durationMs: 0,
    ok: false,
    redirectCount: 0,
    dnsAddresses: [],
    securityHeaders: {
      strictTransportSecurity: false,
      contentSecurityPolicy: false,
      frameProtection: false,
      contentTypeOptions: false,
      referrerPolicy: false,
      permissionsPolicy: false,
    },
  };
}

function failed(
  result: RadarSyntheticProbeResult,
  startedAt: number,
  failureKind: RadarSyntheticProbeResult["failureKind"],
  error: string,
): RadarSyntheticProbeResult {
  return { ...result, durationMs: Math.max(0, Date.now() - startedAt), ok: false, failureKind, error: error.slice(0, 500) };
}

function probeFailureKind(error: unknown): NonNullable<RadarSyntheticProbeResult["failureKind"]> {
  if (error instanceof Error && error.name === "RadarUnsafeUrlError") return "unsafe-url";
  if (error instanceof Error && error.name === "RadarDnsError") return "dns";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "network";
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      if (item !== undefined) await worker(item);
    }
  }));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Synthetic probe failed.";
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
