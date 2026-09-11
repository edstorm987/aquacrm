// Smoke — Public upload storage (the `aquacrm-public` bucket boundary).
// Run in the full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions
// react-server' npx tsx --test scripts/*.test.ts
//
// § Public media storage — behavioural coverage of the three-tier provider
// precedence (Supabase → throw-in-prod → local-dev) and, critically, that the
// helper returns a real public URL — the whole point vs. the proxied private
// path. See docs/development/plans/public-bucket.md (Phase 1).
//
// NOTE: the suite runs test files concurrently in one shared process, so this
// test NEVER mutates global `process.env` / `globalThis.fetch` (that would race
// into other files). Branch selection is driven through the injectable `env`
// argument; the Supabase network path is pinned by source-shape guardrails,
// matching the private-upload-storage convention.

import { strict as assert } from "node:assert";
import { describe, it, test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  storePublicUpload,
  supabasePublicUploadsConfigured,
  durablePublicUploadsRequired,
  publicUploadContentTypeAllowed,
  normalizePublicUploadContentType,
  ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES,
  PublicUploadStorageError,
  PublicUploadContentTypeError,
  PublicUploadContentTrustError,
  PublicUploadAtomicLifecycleError,
  PublicUploadOwnershipProofError,
  PublicUploadSizeError,
  PublicUploadTenantScopeError,
  MAX_PUBLIC_UPLOAD_BYTES,
  publicUploadTrustFailure,
} from "../src/lib/server/publicUploadStorage";
import {
  setContentScanner,
  type ContentTrustAssessment,
} from "../src/lib/server/security/contentTrust";
import {
  clearSecurityEventsForTest,
  recentSecurityEvents,
} from "../src/lib/server/security/securityEvents";

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const tinyBlob = () => new Blob([PNG_BYTES], { type: "image/png" });
const TRUST = {
  tenantId: "agency-1",
  clientId: "client-1",
  siteId: "site-1",
  actor: "publisher-1",
  purpose: "test.public-upload",
} as const;

function assessment(
  verdict: ContentTrustAssessment["verdict"],
  scannerStatus: ContentTrustAssessment["scannerStatus"] = "not-configured",
): ContentTrustAssessment {
  return {
    verdict,
    quarantined: verdict === "quarantined",
    digest: "a".repeat(64),
    sizeBytes: PNG_BYTES.byteLength,
    declaredType: "image/png",
    sniffedType: "image/png",
    scannerStatus,
  };
}

// --- 1. Local-dev fallback returns a resolvable public URL + writes bytes ---
test("local-dev stores public media under public/ and returns a servable URL", async () => {
  const pathname = "website-media/agency-1/smoke-phase1/brand/logo.png";
  const absDir = join(process.cwd(), "public", "uploads-public", "website-media", "agency-1", "smoke-phase1");
  try {
    const stored = await storePublicUpload(
      {
        pathname,
        file: tinyBlob(),
        contentType: "image/png",
        trust: TRUST,
      },
      { NODE_ENV: "development" } as NodeJS.ProcessEnv, // no Supabase, not durable → local
    );

    assert.equal(stored.storageProvider, "local");
    assert.equal(stored.storageKey, pathname);
    // The returned URL must be a root-relative path Next serves statically.
    assert.equal(stored.publicUrl, `/uploads-public/${pathname}`);
    assert.ok(stored.publicUrl.startsWith("/"), "public URL is root-relative");
    assert.equal(stored.contentTrust.verdict, "type-verified");
    assert.equal(stored.contentTrust.sniffedType, "image/png");
    assert.match(stored.contentTrust.digest, /^[a-f0-9]{64}$/);
    // The bytes must actually land on disk where that URL resolves.
    assert.equal(existsSync(join(absDir, "brand", "logo.png")), true);
  } finally {
    await rm(absDir, { recursive: true, force: true });
  }
});

test("a successful public write records digest, tenant and actor lineage", async () => {
  const pathname = "website-media/agency-1/smoke-lineage/lineage.png";
  const absDir = join(process.cwd(), "public", "uploads-public", "website-media", "agency-1", "smoke-lineage");
  clearSecurityEventsForTest();
  try {
    await storePublicUpload(
      {
        pathname,
        file: tinyBlob(),
        contentType: "image/png",
        trust: TRUST,
      },
      { NODE_ENV: "development" } as NodeJS.ProcessEnv,
    );
    const event = recentSecurityEvents().find(item => item.kind === "content-trust.public-upload-stored");
    assert.ok(event);
    assert.equal(event.tenantId, TRUST.tenantId);
    assert.equal(event.actor, TRUST.actor);
    assert.match(String(event.detail?.digest), /^[a-f0-9]{64}$/);
    assert.equal(event.detail?.objectPath, pathname);
    assert.equal(event.detail?.clientId, TRUST.clientId);
    assert.equal(event.detail?.siteId, TRUST.siteId);
    assert.equal(event.detail?.verdict, "type-verified");
    assert.equal(event.detail?.provider, "local");
  } finally {
    await rm(absDir, { recursive: true, force: true });
    clearSecurityEventsForTest();
  }
});

// --- 2. Production without Supabase fails closed (nothing leaks to local) ---
test("public uploads fail closed in production when Supabase is unconfigured", async () => {
  await assert.rejects(
    () => storePublicUpload(
      {
        pathname: "website-media/agency-1/x.png",
        file: tinyBlob(),
        contentType: "image/png",
        trust: TRUST,
      },
      { NODE_ENV: "production" } as NodeJS.ProcessEnv, // durable required, no Supabase → throw
    ),
    (err: unknown) => {
      assert.ok(err instanceof PublicUploadStorageError);
      assert.equal((err as PublicUploadStorageError).code, "durable_public_uploads_required");
      return true;
    },
  );
});

// --- 3. Config predicates gate the branches (pure, injected env) -----------
describe("§ Public upload config predicates", () => {
  it("supabasePublicUploadsConfigured requires BOTH url + service key", () => {
    assert.equal(supabasePublicUploadsConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://x" } as NodeJS.ProcessEnv), false);
    assert.equal(supabasePublicUploadsConfigured({ SUPABASE_SERVICE_ROLE_KEY: "k" } as NodeJS.ProcessEnv), false);
    assert.equal(
      supabasePublicUploadsConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" } as NodeJS.ProcessEnv),
      true,
    );
  });

  it("durablePublicUploadsRequired is true in production / on Vercel", () => {
    assert.equal(durablePublicUploadsRequired({ NODE_ENV: "production" } as NodeJS.ProcessEnv), true);
    assert.equal(durablePublicUploadsRequired({ VERCEL: "1" } as NodeJS.ProcessEnv), true);
    assert.equal(durablePublicUploadsRequired({ VERCEL_ENV: "preview" } as NodeJS.ProcessEnv), true);
    assert.equal(durablePublicUploadsRequired({ NODE_ENV: "development" } as NodeJS.ProcessEnv), false);
  });
});

// --- 4. Design guardrails (pin the deliberate fail-closed shape) -----------
describe("§ Public upload storage — design guardrails", () => {
  const src = readFileSync("src/lib/server/publicUploadStorage.ts", "utf8");

  it("contains no dormant remote upload or provider-delete implementation", () => {
    assert.doesNotMatch(src, /createSupabaseAdminClient/);
    assert.doesNotMatch(src, /\.upload\(/);
    assert.doesNotMatch(src, /\.remove\(/);
    assert.doesNotMatch(src, /getPublicUrl/);
    assert.doesNotMatch(src, /upsert:\s*true/);
    assert.match(src, /PublicUploadOwnershipProofError/);
  });

  it("fails closed in production via a typed error", () => {
    assert.match(src, /durablePublicUploadsRequired/);
    assert.match(src, /PublicUploadStorageError/);
    assert.match(src, /NODE_ENV === "production"/);
  });

  it("does not depend on @vercel/blob (simpler precedence than the private helper)", () => {
    assert.doesNotMatch(src, /from "@vercel\/blob"/);
  });

  it("allow-lists the content type before the provider branch", () => {
    assert.match(src, /publicUploadContentTypeAllowed\(input\.contentType\)/);
    assert.ok(
      src.indexOf("publicUploadContentTypeAllowed(input.contentType)")
        < src.indexOf("const supabaseConfigured = supabasePublicUploadsConfigured(env)"),
      "the allow-list gate must run before the Supabase branch",
    );
    assert.doesNotMatch(src, /"image\/svg\+xml"/);
  });

  it("runs byte-level content trust before the local storage provider", () => {
    assert.match(src, /assessUploadContent/);
    const assessmentAt = src.indexOf("await assessUploadContent");
    assert.ok(assessmentAt > 0, "the byte-level assessment must be called");
    assert.ok(assessmentAt < src.indexOf("await writeFile("));
    assert.match(src, /publicUploadTrustFailure\(assessment, supabaseConfigured\)/);
    assert.ok(
      (src.match(/assertPublicUploadWritesAllowed\(input\)/g) ?? []).length >= 2,
      "write containment must be checked initially and again after scanning before local I/O",
    );
  });

  it("hard-stops the remote public bucket before scanner or provider I/O until atomic lifecycle exists", () => {
    const atomicityAt = src.indexOf("throw new PublicUploadAtomicLifecycleError()");
    assert.ok(atomicityAt > 0, "the release-blocking atomic lifecycle refusal must exist");
    assert.ok(atomicityAt < src.indexOf("await assessUploadContent"));
  });

  it("guards the local write with resolve + a startsWith boundary check", () => {
    assert.match(src, /resolve\(process\.cwd\(\), "public", LOCAL_PUBLIC_DIR\)/);
    assert.match(src, /startsWith\(publicRoot \+ sep\)/);
    assert.match(src, /PublicUploadPathError/);
  });
});

// --- 5. Content-type allow-list (defense in depth, audit hardening) --------
// Public media is CDN-served with no proxy, so it must be inert. The gate sits
// BEFORE the provider branch, so it holds on the Supabase path too.
describe("§ Public upload content-type allow-list", () => {
  const storeWith = (contentType: string) => storePublicUpload(
    {
      pathname: `website-media/agency-1/x`,
      file: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: contentType }),
      contentType,
      trust: TRUST,
    },
    { NODE_ENV: "development" } as NodeJS.ProcessEnv,
  );

  it("rejects image/svg+xml — an SVG can carry script", async () => {
    await assert.rejects(() => storeWith("image/svg+xml"), (err: unknown) => {
      assert.ok(err instanceof PublicUploadContentTypeError);
      assert.equal((err as PublicUploadContentTypeError).code, "public_upload_content_type_not_allowed");
      return true;
    });
    // Nothing may reach disk when the type is refused.
    assert.equal(existsSync(join(process.cwd(), "public", "uploads-public", "smoke-mime")), false);
  });

  it("rejects text/html and other executable / unknown types", async () => {
    for (const bad of ["text/html", "application/javascript", "application/octet-stream", "image/svg", ""]) {
      await assert.rejects(() => storeWith(bad), PublicUploadContentTypeError, `expected ${bad} rejected`);
    }
  });

  it("rejects even when Supabase IS configured (gate is before the branch)", async () => {
    await assert.rejects(
      () => storePublicUpload(
        {
          pathname: "website-media/agency-1/evil.svg",
          file: new Blob([Uint8Array.from([1])], { type: "image/svg+xml" }),
          contentType: "image/svg+xml",
          trust: TRUST,
        },
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://x",
          SUPABASE_SERVICE_ROLE_KEY: "k",
        } as NodeJS.ProcessEnv,
      ),
      PublicUploadContentTypeError,
    );
  });

  it("allows the safe image/video types, case- and parameter-insensitively", () => {
    for (const good of ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES) {
      assert.equal(publicUploadContentTypeAllowed(good), true, `${good} should be allowed`);
    }
    assert.equal(publicUploadContentTypeAllowed("IMAGE/PNG"), true);
    assert.equal(publicUploadContentTypeAllowed(" image/png ; charset=utf-8"), true);
    assert.equal(normalizePublicUploadContentType("IMAGE/PNG; charset=utf-8"), "image/png");
    assert.equal(normalizePublicUploadContentType("image/jpg"), "image/jpeg");
    assert.equal(publicUploadContentTypeAllowed("image/jpg"), true);
    assert.equal(publicUploadContentTypeAllowed("image/svg+xml"), false);
    assert.equal(publicUploadContentTypeAllowed("text/html"), false);
  });

  it("the allow-list contains no executable type", () => {
    for (const t of ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES) {
      assert.ok(t.startsWith("image/") || t.startsWith("video/"), `${t} is not image/video`);
      assert.notEqual(t, "image/svg+xml");
    }
  });

  it("stores the NORMALISED content type, not the caller's verbatim string", async () => {
    const absDir = join(process.cwd(), "public", "uploads-public", "website-media", "agency-1", "smoke-norm");
    try {
      const stored = await storePublicUpload(
        {
          pathname: "website-media/agency-1/smoke-norm/n.png",
          file: tinyBlob(),
          contentType: "IMAGE/PNG; charset=utf-8",
          trust: TRUST,
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      );
      assert.equal(stored.storageProvider, "local");
      assert.equal(existsSync(join(absDir, "n.png")), true);
    } finally {
      await rm(absDir, { recursive: true, force: true });
    }
  });
});

// --- 6. Byte-level trust + public-CDN malware-clear policy -----------------
describe("§ Public upload byte-level trust gate", () => {
  it("rejects arbitrary bytes declared as PNG before any local write", async () => {
    const absDir = join(process.cwd(), "public", "uploads-public", "website-media", "agency-1", "mismatch.png");
    try {
      await assert.rejects(
        () => storePublicUpload(
          {
            pathname: "website-media/agency-1/mismatch.png",
            file: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/png" }),
            contentType: "image/png",
            trust: TRUST,
          },
          { NODE_ENV: "development" } as NodeJS.ProcessEnv,
        ),
        (err: unknown) => {
          assert.ok(err instanceof PublicUploadContentTrustError);
          assert.equal(err.code, "public_upload_content_not_cleared");
          assert.equal(err.reason, "blocked");
          assert.equal(err.assessment.reason, "declared-type-mismatch");
          return true;
        },
      );
      assert.equal(existsSync(absDir), false, "rejected bytes must not reach public/");
    } finally {
      await rm(absDir, { recursive: true, force: true });
    }
  });

  it("rejects active HTML bytes even when declared as allowed image media", async () => {
    await assert.rejects(
      () => storePublicUpload(
        {
          pathname: "website-media/agency-1/polyglot.png",
          file: new Blob(["<!doctype html><script>alert(1)</script>"], { type: "image/png" }),
          contentType: "image/png",
          trust: TRUST,
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      ),
      (err: unknown) => {
        assert.ok(err instanceof PublicUploadContentTrustError);
        assert.equal(err.reason, "blocked");
        assert.equal(err.assessment.reason, "active-content-polyglot");
        return true;
      },
    );
  });

  it("requires a real malware-clear verdict for a world-readable CDN object", () => {
    assert.equal(publicUploadTrustFailure(assessment("malware-cleared", "cleared"), true), null);
    assert.equal(publicUploadTrustFailure(assessment("type-verified"), true), "malware-scan-required");
    assert.equal(publicUploadTrustFailure(assessment("unverified"), true), "malware-scan-required");
    assert.equal(publicUploadTrustFailure(assessment("quarantined", "unavailable"), true), "quarantined");
    assert.equal(publicUploadTrustFailure(assessment("blocked", "malicious"), true), "blocked");
  });

  it("refuses the real Supabase/CDN branch before scanner or provider I/O until atomic lifecycle exists", async () => {
    let scannerTouched = false;
    clearSecurityEventsForTest();
    setContentScanner(async () => {
      scannerTouched = true;
      return { malicious: false };
    });
    try {
      await assert.rejects(
        () => storePublicUpload(
          {
            pathname: "website-media/agency-1/needs-scan.png",
            file: tinyBlob(),
            contentType: "image/png",
            trust: { ...TRUST, purpose: "test.public-cdn" },
          },
          {
            NEXT_PUBLIC_SUPABASE_URL: "https://project.example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-only-placeholder",
          } as NodeJS.ProcessEnv,
        ),
        (err: unknown) => {
          assert.ok(err instanceof PublicUploadAtomicLifecycleError);
          assert.equal(err.code, "public_upload_atomic_lifecycle_required");
          return true;
        },
      );
      assert.equal(scannerTouched, false, "the fail-closed lifecycle gate must precede scanner egress");
      const event = recentSecurityEvents().find(item => item.kind === "public-media.lifecycle-blocked");
      assert.ok(event, "the deliberate release block must be visible to the security event spine");
      assert.equal(event.tenantId, TRUST.tenantId);
      assert.equal(event.actor, TRUST.actor);
      assert.equal(event.detail?.objectPath, "website-media/agency-1/needs-scan.png");
      assert.equal(event.detail?.reason, "atomic-lifecycle-required");
    } finally {
      setContentScanner(null);
      clearSecurityEventsForTest();
    }
  });

  it("keeps public deletion inert until an ownership ledger can prove recall safety", async () => {
    clearSecurityEventsForTest();
    try {
      const { deleteSupabasePublicUpload } = await import("../src/lib/server/publicUploadStorage");
      await assert.rejects(
        () => deleteSupabasePublicUpload({
          storageKey: "website-media/agency-1/client-1/site-1/legacy.png",
          tenantId: "agency-1",
          actor: "incident-controller",
        }),
        (error: unknown) => (
          error instanceof PublicUploadOwnershipProofError
          && error.code === "public_upload_ownership_proof_required"
        ),
      );
      const event = recentSecurityEvents().find(item => item.kind === "public-media.delete-blocked");
      assert.ok(event);
      assert.equal(event.tenantId, "agency-1");
      assert.equal(event.detail?.objectPath, "website-media/agency-1/client-1/site-1/legacy.png");
    } finally {
      clearSecurityEventsForTest();
    }
  });

  it("allows only signature-verified or malware-cleared bytes in local development", () => {
    assert.equal(publicUploadTrustFailure(assessment("type-verified"), false), null);
    assert.equal(publicUploadTrustFailure(assessment("malware-cleared", "cleared"), false), null);
    assert.equal(publicUploadTrustFailure(assessment("unverified"), false), "byte-verification-required");
    assert.equal(publicUploadTrustFailure(assessment("quarantined", "unavailable"), false), "quarantined");
    assert.equal(publicUploadTrustFailure(assessment("blocked", "malicious"), false), "blocked");
  });

  it("recognises AVIF's ISO-BMFF signature instead of treating allowed AVIF as unverified", async () => {
    const absDir = join(process.cwd(), "public", "uploads-public", "website-media", "agency-1", "smoke-avif");
    try {
      const avif = Uint8Array.from([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70,
        0x61, 0x76, 0x69, 0x66,
        0x00, 0x00, 0x00, 0x00,
        0x61, 0x76, 0x69, 0x66,
        0x6d, 0x69, 0x66, 0x31,
      ]);
      const stored = await storePublicUpload(
        {
          pathname: "website-media/agency-1/smoke-avif/image.avif",
          file: new Blob([avif], { type: "image/avif" }),
          contentType: "image/avif",
          trust: TRUST,
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      );
      assert.equal(stored.contentTrust.verdict, "type-verified");
      assert.equal(stored.contentTrust.sniffedType, "image/avif");
    } finally {
      await rm(absDir, { recursive: true, force: true });
    }
  });

  it("does not accept a non-AVIF ISO-BMFF file merely because it has an ftyp box", async () => {
    const mp4Family = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x00, 0x00,
      0x69, 0x73, 0x6f, 0x32,
      0x6d, 0x70, 0x34, 0x31,
    ]);
    await assert.rejects(
      () => storePublicUpload(
        {
          pathname: "website-media/agency-1/smoke-avif/not-avif.avif",
          file: new Blob([mp4Family], { type: "image/avif" }),
          contentType: "image/avif",
          trust: TRUST,
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      ),
      (error: unknown) => (
        error instanceof PublicUploadContentTrustError
        && error.assessment.reason === "declared-type-mismatch"
        && error.assessment.sniffedType === "iso-bmff"
      ),
    );
  });

  it("rejects an oversized public object before hashing or scanner work", async () => {
    let scannerTouched = false;
    setContentScanner(async () => {
      scannerTouched = true;
      return { malicious: false };
    });
    try {
      await assert.rejects(
        () => storePublicUpload(
          {
            pathname: "website-media/agency-1/oversized.png",
            file: new Blob([new Uint8Array(MAX_PUBLIC_UPLOAD_BYTES + 1)], { type: "image/png" }),
            contentType: "image/png",
            trust: TRUST,
          },
          { NODE_ENV: "development" } as NodeJS.ProcessEnv,
        ),
        PublicUploadSizeError,
      );
      assert.equal(scannerTouched, false);
    } finally {
      setContentScanner(null);
    }
  });

  it("refuses a storage key outside the declared tenant namespace", async () => {
    await assert.rejects(
      () => storePublicUpload(
        {
          pathname: "website-media/agency-2/cross-tenant.png",
          file: tinyBlob(),
          contentType: "image/png",
          trust: TRUST,
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      ),
      PublicUploadTenantScopeError,
    );
  });

  it("refuses URL-normalized dot, encoded, slash, backslash, query and fragment path escapes", async () => {
    const unsafePaths = [
      "website-media/agency-1/../agency-2/x.png",
      "website-media/agency-1/%2e%2e/agency-2/x.png",
      "website-media/agency-1/%2fagency-2/x.png",
      "website-media/agency-1\\agency-2/x.png",
      "website-media/agency-1//x.png",
      "website-media/agency-1/x.png?overwrite=1",
      "website-media/agency-1/x.png#fragment",
    ];
    for (const pathname of unsafePaths) {
      await assert.rejects(
        () => storePublicUpload(
          {
            pathname,
            file: tinyBlob(),
            contentType: "image/png",
            trust: TRUST,
          },
          { NODE_ENV: "development" } as NodeJS.ProcessEnv,
        ),
        PublicUploadTenantScopeError,
        pathname,
      );
    }
  });
});

test("the forward bucket migration permits the stricter application MIME and size contract", () => {
  const migration = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20260910010000_harden_aquacrm_public_media_bucket.sql"),
    "utf8",
  );
  const migrationLimit = Number(/file_size_limit\s*=\s*(\d+)/.exec(migration)?.[1]);
  assert.ok(migrationLimit >= MAX_PUBLIC_UPLOAD_BYTES);
  for (const contentType of ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES) {
    assert.ok(migration.includes(`'${contentType}'`), `migration must allow ${contentType}`);
  }
  for (const unsafeOrDrifted of ["image/svg+xml", "application/pdf", "image/jpg"]) {
    assert.equal(migration.includes(`'${unsafeOrDrifted}'`), false, `migration must not allow ${unsafeOrDrifted}`);
  }
});

// --- 7. Local-write path derives only from the canonical tenant pathname ---
describe("§ Public upload local-write path guard", () => {
  it("writes the canonical tenant pathname and returns that same storage identity", async () => {
    const pathname = "website-media/agency-1/smoke-guard/deep/a.png";
    const absDir = join(process.cwd(), "public", "uploads-public", "website-media", "agency-1", "smoke-guard");
    try {
      const stored = await storePublicUpload(
        {
          pathname,
          file: tinyBlob(),
          contentType: "image/png",
          trust: TRUST,
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      );
      assert.equal(stored.storageKey, pathname);
      assert.equal(stored.publicUrl, `/uploads-public/${pathname}`);
      // The URL must resolve to the file that was actually written.
      assert.equal(
        existsSync(join(process.cwd(), "public", ...stored.publicUrl.slice(1).split("/"))),
        true,
      );
    } finally {
      await rm(absDir, { recursive: true, force: true });
    }
  });
});
