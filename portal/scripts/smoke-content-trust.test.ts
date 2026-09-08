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
// NOT claimed: malware scanning. The scanner seam exists; connecting an AV/CDR
// engine is an owner action, and verdicts stay "clean|unverified" until then.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test, { beforeEach } from "node:test";

import { assessUploadContent, ContentTrustError, setContentScanner } from "../src/lib/server/security/contentTrust";
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

test("a connected scanner can block; an unreachable scanner does not take uploads down", async () => {
  setContentScanner(async () => ({ malicious: true }));
  const caught = await assess(PNG, "image/png");
  assert.equal(caught.verdict, "blocked");
  assert.equal(caught.reason, "scanner-verdict-malicious");

  setContentScanner(async () => {
    throw new Error("scanner down");
  });
  const survived = await assess(PNG, "image/png");
  assert.equal(survived.verdict, "clean");
  assert.ok(recentSecurityEvents().some(event => event.kind === "content-trust.scanner-unavailable"));
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
  assert.match(stored.contentTrust?.digest ?? "", /^[0-9a-f]{64}$/);
});
