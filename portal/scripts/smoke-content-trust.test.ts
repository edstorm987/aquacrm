// Content trust gateway — assume-breach containment, Phase 2 (seed).
//
// The verification pass proved every upload surface judged the DECLARED
// filename/MIME only: bytes were never inspected, so an HTML document, a
// script or a native executable stored fine under a media extension. This
// suite pins the content-level gateway:
//   - judged at `storePrivateUpload` — the one function every upload route
//     stores through — BEFORE provider I/O, so a blocked file is never
//     written anywhere;
//   - executables refused everywhere; media-declared HTML (polyglots) refused;
//   - declared types with a known signature must match it; SVG refused by
//     content; "text" may not smuggle NULs;
//   - every stored upload carries a sha256 digest (artifact identity);
//   - refusals land in the security-event spine as digest+types, NEVER
//     contents or filenames.
// NOT claimed: a provisioned external provider. The gateway is implemented and
// hermetically tested; connecting an AV/CDR service remains an owner action.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test, { beforeEach } from "node:test";

import {
  assessUploadContent,
  boundedScannerResponse,
  configuredHttpContentScanner,
  contentTrustObjectVersion,
  ContentTrustError,
  isUnsafeScannerAddress,
  operatorDocumentDownloadAllowed,
  setContentScanner,
} from "../src/lib/server/security/contentTrust";
import { storePrivateUpload } from "../src/lib/server/privateUploadStorage";
import { clearSecurityEventsForTest, recentSecurityEvents } from "../src/lib/server/security/securityEvents";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%μ\n1 0 obj\n");
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]);
const PE = new TextEncoder().encode("MZ\x90\x00PE executable payload");
const HTML = new TextEncoder().encode("  <!DOCTYPE html><html><script>document.cookie</script></html>");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function blob(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes).buffer]);
}

async function assess(bytes: Uint8Array, declaredType: string) {
  return assessUploadContent({ file: blob(bytes), declaredType, purpose: "test" });
}

beforeEach(() => {
  clearSecurityEventsForTest();
  setContentScanner(null);
});

test("genuine media matching its declared type is clean, with a digest identity", async () => {
  for (const [bytes, declared] of [
    [PNG, "image/png"],
    [JPEG, "image/jpeg"],
    [PDF, "application/pdf"],
    [ZIP, "application/zip"],
    [ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ] as const) {
    const result = await assess(bytes, declared);
    assert.equal(result.verdict, "clean", `${declared} should be clean`);
    assert.match(result.digest, /^[0-9a-f]{64}$/);
  }
});

test("native executables are refused whatever the declared type claims", async () => {
  for (const declared of ["application/zip", "image/png", "text/plain", "application/pdf"]) {
    const elf = await assess(ELF, declared);
    assert.equal(elf.verdict, "blocked", `ELF as ${declared}`);
    assert.equal(elf.reason, "executable-content");
    const pe = await assess(PE, declared);
    assert.equal(pe.verdict, "blocked", `PE as ${declared}`);
  }
});

test("an HTML document declared as media is a polyglot and is refused", async () => {
  for (const declared of ["image/png", "image/jpeg", "video/mp4", "application/pdf"]) {
    const result = await assess(HTML, declared);
    assert.equal(result.verdict, "blocked", `HTML as ${declared}`);
    assert.ok(result.reason === "active-content-polyglot" || result.reason === "declared-type-mismatch");
  }
});

test("SVG is refused by CONTENT, so an allowlist regression cannot re-open stored XSS", async () => {
  const byType = await assess(SVG, "image/svg+xml");
  assert.equal(byType.verdict, "blocked");
  const smuggled = await assess(SVG, "text/plain");
  assert.equal(smuggled.verdict, "blocked");
  assert.equal(smuggled.reason, "svg-active-content");
});

test("a declared type with a known signature must match its bytes", async () => {
  const fake = await assess(new TextEncoder().encode("just some text"), "image/png");
  assert.equal(fake.verdict, "blocked");
  assert.equal(fake.reason, "declared-type-mismatch");
  const wrongMedia = await assess(PNG, "image/jpeg");
  assert.equal(wrongMedia.verdict, "blocked");
});

test("text may not smuggle NUL bytes; honest text passes as unverified", async () => {
  const binary = await assess(new Uint8Array([0x68, 0x69, 0x00, 0x01, 0x02]), "text/plain");
  assert.equal(binary.verdict, "blocked");
  assert.equal(binary.reason, "binary-masquerading-as-text");

  const honest = await assess(new TextEncoder().encode("name,email\nAda,ada@example.test\n"), "text/csv");
  assert.equal(honest.verdict, "unverified");
});

test("refusals land in the event spine as digest+types — never contents or filenames", async () => {
  const result = await assess(HTML, "image/png");
  assert.equal(result.verdict, "blocked");
  const events = recentSecurityEvents().filter(event => event.kind === "content-trust.blocked");
  assert.equal(events.length, 1);
  const serialised = JSON.stringify(events[0]);
  assert.ok(serialised.includes(result.digest));
  assert.ok(!serialised.includes("DOCTYPE"), "event must not carry file contents");
  assert.ok(!serialised.includes("document.cookie"), "event must not carry file contents");
});

test("scanner verdicts are explicit and the scanner receives the complete artifact", async () => {
  const large = new Uint8Array(2_048);
  large.set(PNG);
  let scannedBytes = 0;
  setContentScanner(async input => {
    scannedBytes = (await input.file.arrayBuffer()).byteLength;
    return { malicious: false };
  });
  const cleared = await assess(large, "image/png");
  assert.equal(cleared.scannerVerdict, "clean");
  assert.equal(scannedBytes, large.byteLength, "AV/CDR must receive the complete artifact, not only the sniffing head");

  setContentScanner(async () => ({ malicious: true }));
  const caught = await assess(PNG, "image/png");
  assert.equal(caught.verdict, "blocked");
  assert.equal(caught.scannerVerdict, "malicious");
  assert.equal(caught.reason, "scanner-verdict-malicious");

  setContentScanner(async () => {
    throw new Error("scanner down");
  });
  const survived = await assess(PNG, "image/png");
  assert.equal(survived.verdict, "clean");
  assert.equal(survived.scannerVerdict, "unavailable");
  assert.ok(recentSecurityEvents().some(event => event.kind === "content-trust.scanner-unavailable"));
});

test("operator document downloads fail closed without an explicit scanner-clean release", async () => {
  const signatureOnly = await assess(PDF, "application/pdf");
  assert.equal(signatureOnly.verdict, "clean", "signature match remains useful content-type evidence");
  assert.equal(signatureOnly.scannerVerdict, "not-configured");

  for (const trust of [
    undefined,
    { scannerVerdict: "not-configured" as const, quarantineStatus: "quarantined" as const },
    { scannerVerdict: "unavailable" as const, quarantineStatus: "quarantined" as const },
    { scannerVerdict: "clean" as const, quarantineStatus: "quarantined" as const },
  ]) {
    assert.equal(operatorDocumentDownloadAllowed(trust, { storageProvider: "local", storageKey: "candidate.pdf" }), false);
  }
  const digest = "a".repeat(64);
  assert.equal(operatorDocumentDownloadAllowed({
    digest,
    objectVersion: contentTrustObjectVersion("local", "candidate.pdf", digest),
    scannerVerdict: "clean",
    quarantineStatus: "released",
  }, { storageProvider: "local", storageKey: "candidate.pdf" }), true);
  assert.equal(operatorDocumentDownloadAllowed({
    digest,
    objectVersion: "b".repeat(64),
    scannerVerdict: "clean",
    quarantineStatus: "released",
  }, { storageProvider: "local", storageKey: "candidate.pdf" }), false, "a clean verdict must be bound to the exact provider object");
});

test("the configured AV/CDR gateway is exact-origin, full-file and connect-time pinned", async () => {
  let receivedBytes = 0;
  let resolved = 0;
  const scanner = configuredHttpContentScanner({
    NODE_ENV: "test",
    CONTENT_SCANNER_URL: "http://scanner.security.example.net/v1/scan",
    CONTENT_SCANNER_ALLOWED_ORIGINS: "http://scanner.security.example.net",
    CONTENT_SCANNER_BEARER_TOKEN: "local-test-scanner-token",
  }, {
    resolve: async hostname => {
      resolved += 1;
      assert.equal(hostname, "scanner.security.example.net");
      return [{ address: "93.184.216.34", family: 4 }];
    },
    transport: async input => {
      assert.equal(input.url.toString(), "http://scanner.security.example.net/v1/scan");
      assert.equal(input.address, "93.184.216.34", "transport must connect to the vetted IP, not resolve again");
      assert.equal(input.servername, "scanner.security.example.net", "TLS SNI/Host identity remains the configured host");
      assert.equal(input.headers.authorization, "Bearer local-test-scanner-token");
      receivedBytes = (await input.body.arrayBuffer()).byteLength;
      return { status: 200, bodyText: JSON.stringify({ verdict: "clean" }), redirected: false };
    },
  });
  assert.ok(scanner);
  const file = blob(new Uint8Array(1_024));
  const result = await scanner!({ file, head: new Uint8Array(512), digest: "a".repeat(64), declaredType: "application/pdf", sizeBytes: 1_024 });
  assert.equal(result.malicious, false);
  assert.equal(receivedBytes, 1_024);
  assert.equal(resolved, 1);

  assert.equal(configuredHttpContentScanner({
    NODE_ENV: "production",
    CONTENT_SCANNER_URL: "http://scanner.example.test/scan",
    CONTENT_SCANNER_ALLOWED_ORIGINS: "http://scanner.example.test",
    CONTENT_SCANNER_BEARER_TOKEN: "x".repeat(32),
  }), null, "production scanner transport must use HTTPS");
  assert.equal(configuredHttpContentScanner({
    NODE_ENV: "production",
    CONTENT_SCANNER_URL: "https://127.0.0.1/scan",
    CONTENT_SCANNER_ALLOWED_ORIGINS: "https://127.0.0.1",
    CONTENT_SCANNER_BEARER_TOKEN: "x".repeat(32),
  }), null, "production scanner endpoint must not target a private/loopback host");
  assert.equal(configuredHttpContentScanner({
    NODE_ENV: "production",
    CONTENT_SCANNER_URL: "https://scanner.example.com/scan",
    CONTENT_SCANNER_ALLOWED_ORIGINS: "https://different.example.com",
    CONTENT_SCANNER_BEARER_TOKEN: "x".repeat(32),
  }), null, "the credential may leave only through an exact configured origin");
});

test("scanner address policy rejects private, reserved, multicast, CGNAT, benchmark and documentation space", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.2",
    "203.0.113.2", "224.0.0.1", "240.0.0.1", "::", "::1", "::ffff:127.0.0.1",
    "64:ff9b::1", "100::1", "2001:2::1", "2001:db8::1", "2002::1", "3fff::1",
    "5f00::1", "fc00::1", "fe80::1", "ff02::1",
  ]) {
    assert.equal(isUnsafeScannerAddress(address), true, address);
  }
  assert.equal(isUnsafeScannerAddress("93.184.216.34"), false);
  assert.equal(isUnsafeScannerAddress("2606:4700:4700::1111"), false);
});

test("scanner rejects mixed DNS/private rebinding answers and redirects before sending elsewhere", async () => {
  let transports = 0;
  const env = {
    NODE_ENV: "production",
    CONTENT_SCANNER_URL: "https://scanner.example.com/scan",
    CONTENT_SCANNER_ALLOWED_ORIGINS: "https://scanner.example.com",
    CONTENT_SCANNER_BEARER_TOKEN: "x".repeat(32),
  } as NodeJS.ProcessEnv;
  const rebound = configuredHttpContentScanner(env, {
    resolve: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ],
    transport: async () => {
      transports += 1;
      return { status: 200, bodyText: '{"verdict":"clean"}', redirected: false };
    },
  });
  assert.ok(rebound);
  await assert.rejects(() => rebound!({ file: blob(PDF), head: PDF, digest: "a".repeat(64), declaredType: "application/pdf", sizeBytes: PDF.byteLength }), /private-or-reserved/);
  assert.equal(transports, 0, "mixed DNS answers must be rejected before transport");

  const redirected = configuredHttpContentScanner(env, {
    resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    transport: async () => ({ status: 307, bodyText: "", redirected: true }),
  });
  assert.ok(redirected);
  await assert.rejects(() => redirected!({ file: blob(PDF), head: PDF, digest: "a".repeat(64), declaredType: "application/pdf", sizeBytes: PDF.byteLength }), /redirect-refused/);
});

test("scanner deadline covers DNS and refuses transport after resolution times out", async () => {
  let transports = 0;
  const scanner = configuredHttpContentScanner({
    NODE_ENV: "test",
    CONTENT_SCANNER_URL: "http://scanner.security.example.net/v1/scan",
    CONTENT_SCANNER_ALLOWED_ORIGINS: "http://scanner.security.example.net",
    CONTENT_SCANNER_BEARER_TOKEN: "local-test-scanner-token",
  }, {
    resolve: async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
      return [{ address: "93.184.216.34", family: 4 }];
    },
    transport: async () => {
      transports += 1;
      return { status: 200, bodyText: '{"verdict":"clean"}', redirected: false };
    },
  }, 5);
  assert.ok(scanner);
  const startedAt = Date.now();
  await assert.rejects(
    () => scanner!({ file: blob(PDF), head: PDF, digest: "a".repeat(64), declaredType: "application/pdf", sizeBytes: PDF.byteLength }),
    /scanner-timeout/,
  );
  assert.ok(Date.now() - startedAt < 60, "the end-to-end deadline must not wait for delayed DNS");
  assert.equal(transports, 0, "timed-out DNS must never advance to scanner transport");
});

test("scanner response parsing cancels and rejects a body above the fixed response ceiling", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(17 * 1024));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(() => boundedScannerResponse(new Response(body)), /scanner-response-too-large/);
  assert.equal(cancelled, true);
});

test("storePrivateUpload refuses a blocked file BEFORE any provider I/O", async () => {
  const localKey = `content-trust-test/blocked-${Date.now()}.png`;
  await assert.rejects(
    storePrivateUpload({
      pathname: localKey,
      file: blob(HTML),
      contentType: "image/png",
      localDirectory: "content-trust-test",
      localKey,
    }),
    ContentTrustError,
  );
  assert.ok(!existsSync(join(process.cwd(), ".data", "content-trust-test", localKey)), "a blocked upload must never touch disk");
});

test("storePrivateUpload returns the digest-level trust record for clean files", async () => {
  const localKey = `clean-${Date.now()}.png`;
  const stored = await storePrivateUpload({
    pathname: localKey,
    file: blob(PNG),
    contentType: "image/png",
    localDirectory: "content-trust-test",
    localKey,
  });
  assert.equal(stored.contentTrust?.verdict, "clean");
  assert.equal(stored.contentTrust?.scannerVerdict, "not-configured");
  assert.match(stored.contentTrust?.digest ?? "", /^[0-9a-f]{64}$/);
});
